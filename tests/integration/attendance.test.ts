import test from "node:test";
import assert from "node:assert/strict";
import { AttendanceService } from "../../src/modules/attendance/application/attendance";
import { DrizzleAttendanceStore } from "../../src/modules/attendance/infrastructure/attendance-store";
import { AttendanceError } from "../../src/modules/attendance/domain/attendance";
import { AuthorizationDeniedError } from "../../src/modules/identity/domain/access-errors";
import { AttendanceWeb } from "../../src/modules/attendance/web/attendance-web";
import { operationFixture, eq, and, pgCode } from "./operation-fixture";
const rejected = (code: AttendanceError["code"]) => (error: unknown) =>
  error instanceof AttendanceError && error.code === code;
test("Attendance I: authorized check-in, correction, integrity and races", async (t) => {
  const f = await operationFixture(),
    { db, schema, actor, student, academic } = f;
  const service = new AttendanceService(new DrizzleAttendanceStore(db));
  const locationId = f.locationRows[0].id;
  const session = await f.session();
  const sessionId = session.id;
  try {
    await t.test(
      "scheduled and nonparticipants have no context or check-in",
      async () => {
        assert.equal(
          (await service.resolve({ ...student, locationId })).sessions.length,
          0,
        );
        await assert.rejects(
          service.checkIn({ ...student, sessionId, locationId }),
          rejected("state"),
        );
        await academic.changeSessionStatus({
          ...actor,
          sessionId,
          status: "open",
        });
        const stranger = { ...student, actorUserId: f.userIds[2] };
        assert.equal(
          (await service.resolve({ ...stranger, locationId })).sessions.length,
          0,
        );
        await assert.rejects(
          service.checkIn({ ...stranger, sessionId, locationId }),
          rejected("not-found"),
        );
      },
    );
    await t.test(
      "unique candidate, validated location, no silent write",
      async () => {
        const resolved = await service.resolve({ ...student, locationId });
        assert.equal(resolved.selectedSessionId, sessionId);
        assert.equal((await service.mine(student)).length, 0);
        await assert.rejects(
          service.resolve({ ...student, locationId: f.locationRows[2].id }),
          rejected("not-found"),
        );
        await assert.rejects(
          service.checkIn({
            ...student,
            sessionId,
            locationId: f.locationRows[1].id,
          }),
          rejected("relation"),
        );
        await assert.rejects(
          service.checkIn({
            ...student,
            laboratoryId: f.labIds[1],
            sessionId,
            locationId,
          }),
          rejected("not-found"),
        );
      },
    );
    await t.test("multiple candidates require explicit choice", async () => {
      const second = await f.session();
      await academic.changeSessionStatus({
        ...actor,
        sessionId: second.id,
        status: "open",
      });
      const resolved = await service.resolve({ ...student, locationId });
      assert.equal(resolved.sessions.length, 2);
      assert.equal(resolved.selectedSessionId, null);
      await academic.changeSessionStatus({
        ...actor,
        sessionId: second.id,
        status: "cancelled",
      });
      await assert.rejects(
        service.checkIn({ ...student, sessionId: second.id, locationId }),
        rejected("state"),
      );
    });
    await t.test(
      "concurrent confirmations persist exactly one attendance and event",
      async () => {
        const rows = await Promise.all([
          service.checkIn({ ...student, sessionId, locationId }),
          service.checkIn({ ...student, sessionId, locationId }),
        ]);
        assert.equal(rows[0].id, rows[1].id);
        assert.equal(
          rows[0].checkInAt?.getTime(),
          rows[1].checkInAt?.getTime(),
        );
        assert.equal((await service.mine(student)).length, 1);
        const events = await db
          .select()
          .from(schema.attendanceEvents)
          .where(eq(schema.attendanceEvents.attendanceId, rows[0].id));
        assert.equal(events.length, 1);
      },
    );
    await t.test(
      "own history cannot reveal roster; web ignores posted actor and source",
      async () => {
        await assert.rejects(
          service.roster({ ...student, sessionId }),
          AuthorizationDeniedError,
        );
        const web = new AttendanceWeb({
          currentActor: async () => ({ actorUserId: student.actorUserId }),
          laboratory: {
            execute: async () => ({
              id: student.laboratoryId,
              slug: f.slug,
              name: "Fixture",
              roleKeys: [],
              permissionKeys: [],
            }),
          },
          attendance: service,
        });
        const form = new FormData();
        form.set("sessionId", sessionId);
        form.set("locationId", locationId);
        form.set("actorUserId", actor.actorUserId);
        form.set("userId", actor.actorUserId);
        form.set("source", "AGENT");
        const row = await web.submit(f.slug, "checkin", form);
        assert.equal(row.userId, student.actorUserId);
        assert.equal((await service.roster({ ...actor, sessionId })).length, 1);
      },
    );
    await t.test(
      "manager who participates cannot intervene; staff requires reason",
      async () => {
        const member = f.members.find(
          (m) =>
            m.userId === student.actorUserId &&
            m.laboratoryId === student.laboratoryId,
        )!;
        await db
          .insert(schema.membershipRoles)
          .values({ membershipId: member.id, roleId: f.roleIds[0] });
        const row = (await service.mine(student))[0];
        await assert.rejects(
          service.correct({
            ...student,
            sessionId,
            userId: student.actorUserId,
            status: "late",
            reason: "Review",
            expectedVersion: row.version,
          }),
          rejected("own-participation"),
        );
        await db
          .delete(schema.membershipRoles)
          .where(
            and(
              eq(schema.membershipRoles.membershipId, member.id),
              eq(schema.membershipRoles.roleId, f.roleIds[0]),
            ),
          );
        await assert.rejects(
          async () =>
            service.correct({
              ...actor,
              sessionId,
              userId: student.actorUserId,
              status: "late",
              reason: " ",
              expectedVersion: row.version,
            }),
          rejected("input"),
        );
      },
    );
    await t.test(
      "correction races detect stale versions and preserve check-in",
      async () => {
        const before = (await service.mine(student))[0];
        const results = await Promise.allSettled(
          ["late", "absent"].map((status) =>
            service.correct({
              ...actor,
              sessionId,
              userId: student.actorUserId,
              status,
              reason: "Review",
              expectedVersion: before.version,
            }),
          ),
        );
        assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
        const after = (await service.mine(student))[0];
        assert.equal(after.checkInAt?.getTime(), before.checkInAt?.getTime());
        assert.equal(after.version, 2);
        const events = await db
          .select()
          .from(schema.attendanceEvents)
          .where(eq(schema.attendanceEvents.attendanceId, after.id));
        assert.equal(events.length, 2);
        await assert.rejects(
          db
            .update(schema.attendanceEvents)
            .set({ reason: "tamper" })
            .where(eq(schema.attendanceEvents.id, events[0].id)),
          (e) => pgCode(e) === "23514",
        );
      },
    );
    await t.test(
      "closed sessions permit existing corrections but no new records",
      async () => {
        await academic.changeSessionStatus({
          ...actor,
          sessionId,
          status: "closed",
        });
        const row = await service.checkIn({
          ...student,
          sessionId,
          locationId,
        });
        await service.correct({
          ...actor,
          sessionId,
          userId: student.actorUserId,
          status: "present",
          reason: "Review after closure",
          expectedVersion: row.version,
        });
        await assert.rejects(
          service.record({
            ...actor,
            sessionId,
            userId: student.actorUserId,
            status: "present",
            reason: "Late creation",
          }),
          rejected("state"),
        );
        assert.equal((await service.mine(student)).length, 1);
      },
    );
    await t.test(
      "staff records absence without fictional check-in; closure races self check-in",
      async () => {
        const other = await f.session(f.spaceRows[0].id, [
          f.userIds[1],
          f.userIds[2],
        ]);
        await academic.changeSessionStatus({
          ...actor,
          sessionId: other.id,
          status: "open",
        });
        const absent = await service.record({
          ...actor,
          sessionId: other.id,
          userId: f.userIds[2],
          status: "absent",
          reason: "Verified roster",
        });
        assert.equal(absent.checkInAt, null);
        const results = await Promise.allSettled([
          service.checkIn({ ...student, sessionId: other.id, locationId }),
          academic.changeSessionStatus({
            ...actor,
            sessionId: other.id,
            status: "closed",
          }),
        ]);
        assert.equal(results[1].status, "fulfilled");
        if (results[0].status === "fulfilled")
          assert.ok(results[0].value.checkInAt);
        else assert.ok(rejected("state")(results[0].reason));
      },
    );
    await t.test(
      "revoked membership and deactivated location reject new check-in",
      async () => {
        const other = await f.session();
        await academic.changeSessionStatus({
          ...actor,
          sessionId: other.id,
          status: "open",
        });
        await db
          .update(schema.locations)
          .set({ isActive: false })
          .where(eq(schema.locations.id, locationId));
        await assert.rejects(
          service.checkIn({ ...student, sessionId: other.id, locationId }),
          rejected("relation"),
        );
        await db
          .update(schema.locations)
          .set({ isActive: true })
          .where(eq(schema.locations.id, locationId));
        const member = f.members.find(
          (m) =>
            m.userId === student.actorUserId &&
            m.laboratoryId === student.laboratoryId,
        )!;
        await db
          .update(schema.laboratoryMemberships)
          .set({ isActive: false })
          .where(eq(schema.laboratoryMemberships.id, member.id));
        await assert.rejects(
          service.checkIn({ ...student, sessionId: other.id, locationId }),
          AuthorizationDeniedError,
        );
        await db
          .update(schema.laboratoryMemberships)
          .set({ isActive: true })
          .where(eq(schema.laboratoryMemberships.id, member.id));
      },
    );
    await t.test(
      "PostgreSQL rejects duplicate and mismatched location rows",
      async () => {
        const row = (await service.mine(student))[0];
        const { id, ...values } = row;
        void id;
        await assert.rejects(
          db.insert(schema.attendance).values(values),
          (e) => pgCode(e) === "23505",
        );
        const other = await f.session();
        await assert.rejects(
          db.insert(schema.attendance).values({
            ...values,
            sessionId: other.id,
            locationId: f.locationRows[1].id,
          }),
          (e) => pgCode(e) === "23503",
        );
      },
    );
  } finally {
    await f.cleanup();
  }
});
