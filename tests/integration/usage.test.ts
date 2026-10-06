import test from "node:test";
import assert from "node:assert/strict";
import { UsageService } from "../../src/modules/usage/application/usage";
import { DrizzleUsageStore } from "../../src/modules/usage/infrastructure/usage-store";
import { UsageError } from "../../src/modules/usage/domain/usage";
import { AttendanceService } from "../../src/modules/attendance/application/attendance";
import { DrizzleAttendanceStore } from "../../src/modules/attendance/infrastructure/attendance-store";
import {
  CreateReservation,
  CancelReservation,
} from "../../src/modules/reservations/application/reservations";
import { DrizzleReservationStore } from "../../src/modules/reservations/infrastructure/reservation-store";
import { AuthorizationDeniedError } from "../../src/modules/identity/domain/access-errors";
import { UsageWeb } from "../../src/modules/usage/web/usage-web";
import { operationFixture, eq, pgCode } from "./operation-fixture";
const rejected = (code: UsageError["code"]) => (error: unknown) =>
  error instanceof UsageError && error.code === code;
test("Usage I: actual use, academic/reservation contexts, isolation and concurrency", async (t) => {
  const f = await operationFixture(),
    { db, schema, actor, student, academic } = f;
  const service = new UsageService(new DrizzleUsageStore(db)),
    attendance = new AttendanceService(new DrizzleAttendanceStore(db));
  const reservations = new CreateReservation(new DrizzleReservationStore(db)),
    cancel = new CancelReservation(new DrizzleReservationStore(db));
  const session = await f.session(),
    sessionId = session.id,
    resourceId = f.resourceRows[0].id;
  const start = {
    ...student,
    kind: "academic",
    contextId: sessionId,
    resourceId,
  };
  try {
    await t.test(
      "session participants, opening and resources are revalidated",
      async () => {
        assert.equal((await service.options(student)).length, 0);
        await assert.rejects(service.start(start), rejected("state"));
        await academic.changeSessionStatus({
          ...actor,
          sessionId,
          status: "open",
        });
        assert.ok(
          (await service.options(student)).some(
            (o) => o.resourceId === resourceId && o.contextId === sessionId,
          ),
        );
        await assert.rejects(
          service.start({ ...start, actorUserId: f.userIds[2] }),
          rejected("not-found"),
        );
        await assert.rejects(
          service.start({ ...start, resourceId: f.resourceRows[1].id }),
          rejected("relation"),
        );
        await assert.rejects(
          service.start({ ...start, laboratoryId: f.labIds[1] }),
          rejected("not-found"),
        );
        await db
          .update(schema.resources)
          .set({ isActive: false })
          .where(eq(schema.resources.id, resourceId));
        await assert.rejects(service.start(start), rejected("relation"));
        await db
          .update(schema.resources)
          .set({ isActive: true })
          .where(eq(schema.resources.id, resourceId));
      },
    );
    await t.test(
      "attendance does not create use; concurrent starts produce one row and event",
      async () => {
        await attendance.checkIn({
          ...student,
          sessionId,
          locationId: f.locationRows[0].id,
        });
        assert.equal((await service.mine(student)).length, 0);
        const [a, b] = await Promise.all([
          service.start(start),
          service.start(start),
        ]);
        assert.equal(a.id, b.id);
        assert.equal(a.startedAt.getTime(), b.startedAt.getTime());
        const events = await db
          .select()
          .from(schema.usageEvents)
          .where(eq(schema.usageEvents.usageId, a.id));
        assert.equal(events.length, 1);
      },
    );
    await t.test(
      "active use cannot silently change context and histories are permission-scoped",
      async () => {
        const second = await f.session();
        await academic.changeSessionStatus({
          ...actor,
          sessionId: second.id,
          status: "open",
        });
        await assert.rejects(
          service.start({ ...start, contextId: second.id }),
          rejected("conflict"),
        );
        await assert.rejects(
          service.trace({ ...student, resourceId }),
          AuthorizationDeniedError,
        );
        assert.equal((await service.trace({ ...actor, resourceId })).length, 1);
        await assert.rejects(
          service.trace({ ...actor, laboratoryId: f.labIds[1], resourceId }),
          rejected("not-found"),
        );
        assert.equal(
          (await service.mine({ ...student, actorUserId: f.userIds[2] }))
            .length,
          0,
        );
      },
    );
    await t.test(
      "only owner can finish; closure does not erase use or prevent ending it",
      async () => {
        const row = (await service.mine(student))[0];
        await assert.rejects(
          service.finish({ ...actor, usageId: row.id }),
          rejected("not-found"),
        );
        await academic.changeSessionStatus({
          ...actor,
          sessionId,
          status: "closed",
        });
        await assert.rejects(service.start(start), rejected("state"));
        const [a, b] = await Promise.all([
          service.finish({ ...student, usageId: row.id }),
          service.finish({ ...student, usageId: row.id }),
        ]);
        assert.equal(a.endedAt?.getTime(), b.endedAt?.getTime());
        assert.ok(a.endedAt && a.endedAt >= a.startedAt);
        const events = await db
          .select()
          .from(schema.usageEvents)
          .where(eq(schema.usageEvents.usageId, row.id));
        assert.equal(events.length, 2);
        await assert.rejects(
          db
            .update(schema.usageEvents)
            .set({ action: "tamper" })
            .where(eq(schema.usageEvents.id, events[0].id)),
          (e) => pgCode(e) === "23514",
        );
      },
    );
    await t.test(
      "future and cancelled reservations cannot authorize use",
      async () => {
        const r = await reservations.execute({
          ...student,
          spaceId: f.spaceRows[1].id,
          resourceIds: [f.resourceRows[1].id],
          isExclusive: false,
          startsAt: new Date(Date.now() + 60000).toISOString(),
          endsAt: new Date(Date.now() + 120000).toISOString(),
        });
        const input = {
          ...student,
          kind: "reservation",
          contextId: r.id,
          resourceId: f.resourceRows[1].id,
        };
        await assert.rejects(service.start(input), rejected("state"));
        await cancel.execute({ ...student, reservationId: r.id });
        await assert.rejects(service.start(input), rejected("state"));
      },
    );
    await t.test(
      "current own reservation authorizes only included resources and never creates attendance",
      async () => {
        const extra = (
          await db
            .insert(schema.resources)
            .values({ spaceId: f.spaceRows[1].id, name: "Other machine" })
            .returning()
        )[0];
        try {
          const startsAt = new Date(Date.now() + 500),
            endsAt = new Date(Date.now() + 600000);
          const r = await reservations.execute({
            ...student,
            spaceId: f.spaceRows[1].id,
            resourceIds: [f.resourceRows[1].id],
            isExclusive: false,
            startsAt: startsAt.toISOString(),
            endsAt: endsAt.toISOString(),
          });
          await new Promise((resolve) =>
            setTimeout(
              resolve,
              Math.max(0, startsAt.getTime() - Date.now() + 10),
            ),
          );
          const input = {
            ...student,
            kind: "reservation",
            contextId: r.id,
            resourceId: f.resourceRows[1].id,
          };
          await assert.rejects(
            service.start({ ...input, actorUserId: actor.actorUserId }),
            rejected("not-found"),
          );
          await assert.rejects(
            service.start({ ...input, resourceId: extra.id }),
            rejected("relation"),
          );
          const before = (await attendance.mine(student)).length;
          const u = await service.start(input);
          assert.equal(u.reservationId, r.id);
          assert.equal(u.sessionId, null);
          assert.equal((await attendance.mine(student)).length, before);
          await service.finish({ ...student, usageId: u.id });
        } finally {
          await db
            .delete(schema.resources)
            .where(eq(schema.resources.id, extra.id));
        }
      },
    );
    await t.test(
      "exclusive current reservation permits resources in that space; web uses server actor",
      async () => {
        const startsAt = new Date(Date.now() + 500);
        const r = await reservations.execute({
          ...student,
          spaceId: f.spaceRows[2].id,
          laboratoryId: f.labIds[1],
          resourceIds: [],
          isExclusive: true,
          startsAt: startsAt.toISOString(),
          endsAt: new Date(Date.now() + 600000).toISOString(),
        });
        await new Promise((resolve) =>
          setTimeout(
            resolve,
            Math.max(0, startsAt.getTime() - Date.now() + 10),
          ),
        );
        const web = new UsageWeb({
          currentActor: async () => ({ actorUserId: student.actorUserId }),
          laboratory: {
            execute: async () => ({
              id: f.labIds[1],
              slug: "test",
              name: "Test",
              roleKeys: [],
              permissionKeys: [],
            }),
          },
          usage: service,
        });
        const form = new FormData();
        form.set("selection", `reservation:${r.id}:${f.resourceRows[2].id}`);
        form.set("actorUserId", actor.actorUserId);
        form.set("source", "AGENT");
        const u = await web.submit("test", "start", form);
        assert.equal(u.userId, student.actorUserId);
        const [event] = await db
          .select()
          .from(schema.usageEvents)
          .where(eq(schema.usageEvents.usageId, u.id));
        assert.equal(event.source, "WEB");
        await service.finish({
          ...student,
          laboratoryId: f.labIds[1],
          usageId: u.id,
        });
      },
    );
    await t.test(
      "PostgreSQL rejects missing contexts, wrong spaces and duplicate active use",
      async () => {
        const s = await f.session();
        await academic.changeSessionStatus({
          ...actor,
          sessionId: s.id,
          status: "open",
        });
        const u = await service.start({ ...start, contextId: s.id });
        const { id, ...values } = u;
        void id;
        await assert.rejects(
          db.insert(schema.resourceUsage).values(values),
          (e) => pgCode(e) === "23505",
        );
        await assert.rejects(
          db
            .insert(schema.resourceUsage)
            .values({ ...values, sessionId: null }),
          (e) => pgCode(e) === "23514",
        );
        await assert.rejects(
          db.insert(schema.resourceUsage).values({
            ...values,
            endedAt: new Date(values.startedAt.getTime() + 1),
            spaceId: f.spaceRows[1].id,
          }),
          (e) => pgCode(e) === "23503",
        );
        await service.finish({ ...student, usageId: u.id });
      },
    );
    await t.test(
      "closure race cannot start use after closure and revoked membership blocks writes",
      async () => {
        const s = await f.session();
        await academic.changeSessionStatus({
          ...actor,
          sessionId: s.id,
          status: "open",
        });
        const results = await Promise.allSettled([
          service.start({ ...start, contextId: s.id }),
          academic.changeSessionStatus({
            ...actor,
            sessionId: s.id,
            status: "closed",
          }),
        ]);
        assert.equal(results[1].status, "fulfilled");
        if (results[0].status === "fulfilled")
          await service.finish({ ...student, usageId: results[0].value.id });
        else assert.ok(rejected("state")(results[0].reason));
        const member = f.members.find(
          (m) =>
            m.userId === student.actorUserId &&
            m.laboratoryId === student.laboratoryId,
        )!;
        await db
          .update(schema.laboratoryMemberships)
          .set({ isActive: false })
          .where(eq(schema.laboratoryMemberships.id, member.id));
        await assert.rejects(service.start(start), AuthorizationDeniedError);
        await db
          .update(schema.laboratoryMemberships)
          .set({ isActive: true })
          .where(eq(schema.laboratoryMemberships.id, member.id));
      },
    );
  } finally {
    await f.cleanup();
  }
});
