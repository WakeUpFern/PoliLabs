import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { and, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../../src/infrastructure/database/schema";
import { users } from "../../src/modules/identity/infrastructure/auth-schema";
import {
  laboratories,
  laboratoryMemberships,
  roles,
  permissions,
  rolePermissions,
  membershipRoles,
} from "../../src/modules/identity/infrastructure/access-schema";
import { spaces } from "../../src/modules/spatial/infrastructure/spatial-schema";
import {
  practices,
  labSessions,
  sessionParticipants,
  academicEvents,
} from "../../src/modules/academic/infrastructure/academic-schema";
import { AcademicService } from "../../src/modules/academic/application/academic";
import { DrizzleAcademicStore } from "../../src/modules/academic/infrastructure/academic-store";
import { AcademicError } from "../../src/modules/academic/domain/academic";
import { AuthorizationDeniedError } from "../../src/modules/identity/domain/access-errors";
import { AuthorizationService } from "../../src/modules/identity/application/authorization-service";
import { GetLaboratoryBySlug } from "../../src/modules/identity/application/get-laboratory-by-slug";
import {
  DrizzleAuthorizationReader,
  DrizzleLaboratoryReader,
} from "../../src/modules/identity/infrastructure/access-repository";
import { AcademicWeb } from "../../src/modules/academic/web/academic-web";
import { prepareIntegrationDatabase } from "./database";
function pgCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return;
  if ("code" in error) return String(error.code);
  if ("cause" in error) return pgCode(error.cause);
}
function rejected(code: AcademicError["code"]) {
  return (error: unknown) =>
    error instanceof AcademicError && error.code === code;
}
test("Academic I authorized workflows, PostgreSQL integrity and concurrency", async (context) => {
  const pool = new Pool({
    connectionString: await prepareIntegrationDatabase(),
    max: 10,
  });
  const db = drizzle(pool, { schema });
  const suffix = randomUUID(),
    userIds = [randomUUID(), randomUUID(), randomUUID(), randomUUID()],
    labIds = [randomUUID(), randomUUID()],
    roleIds = [randomUUID(), randomUUID()],
    spaceIds = [randomUUID(), randomUUID()];
  const actor = {
    actorUserId: userIds[0],
    laboratoryId: labIds[0],
    source: "WEB",
  };
  const student = { actorUserId: userIds[1], laboratoryId: labIds[0] };
  const service = new AcademicService(new DrizzleAcademicStore(db));
  let sessionActor = userIds[0];
  const auth = new AuthorizationService(new DrizzleAuthorizationReader(db));
  const web = new AcademicWeb({
    currentActor: async () => ({ actorUserId: sessionActor }),
    laboratory: new GetLaboratoryBySlug(auth, new DrizzleLaboratoryReader(db)),
    authorization: auth,
    academic: service,
  });
  const slug = `academic-${suffix}-0`;
  const values = {
    spaceId: spaceIds[0],
    teacherUserId: userIds[0],
    startsAt: "2026-10-05T20:00:00Z",
    endsAt: "2026-10-05T22:00:00Z",
    participantUserIds: [userIds[1]],
  };
  let practiceId = "",
    sessionId = "";
  try {
    await db.insert(users).values(
      userIds.map((id, i) => ({
        id,
        name: `Academic fixture ${i}`,
        email: `academic-${suffix}-${i}@invalid.test`,
      })),
    );
    await db.insert(laboratories).values(
      labIds.map((id, i) => ({
        id,
        name: `Academic lab ${i}`,
        slug: `academic-${suffix}-${i}`,
      })),
    );
    await db.insert(roles).values(
      roleIds.map((id, i) => ({
        id,
        key: `academic-${suffix}-${i}`,
        name: "Academic fixture",
        description: "Synthetic fixture",
      })),
    );
    const catalog = await db
      .select()
      .from(permissions)
      .where(
        inArray(permissions.key, [
          "laboratory.read",
          "academic.read",
          "academic.manage",
        ]),
      );
    assert.equal(catalog.length, 3);
    await db
      .insert(rolePermissions)
      .values(catalog.map((p) => ({ roleId: roleIds[0], permissionId: p.id })));
    await db
      .insert(rolePermissions)
      .values(
        catalog
          .filter((p) => p.key !== "academic.manage")
          .map((p) => ({ roleId: roleIds[1], permissionId: p.id })),
      );
    const members = await db
      .insert(laboratoryMemberships)
      .values([
        { userId: userIds[0], laboratoryId: labIds[0] },
        { userId: userIds[0], laboratoryId: labIds[1] },
        { userId: userIds[1], laboratoryId: labIds[0] },
        { userId: userIds[2], laboratoryId: labIds[0] },
        { userId: userIds[3], laboratoryId: labIds[1] },
      ])
      .returning();
    await db.insert(membershipRoles).values(
      members.map((m) => ({
        membershipId: m.id,
        roleId: m.userId === userIds[1] ? roleIds[1] : roleIds[0],
      })),
    );
    await db.insert(spaces).values(
      spaceIds.map((id, i) => ({
        id,
        laboratoryId: labIds[i],
        slug: "room",
        name: "Room",
      })),
    );
    await context.test(
      "web creates a draft with server actor/origin, students cannot read it",
      async () => {
        const form = new FormData();
        form.set("title", "Operación de torno");
        form.set("instructions", "Lee el manual.");
        form.set("actorUserId", userIds[1]);
        form.set("source", "AGENT");
        practiceId = (await web.submit(slug, "create-practice", null, form))
          .practiceId!;
        const detail = await service.practice({ ...actor, practiceId });
        assert.equal(detail.practice.createdBy, userIds[0]);
        assert.equal(detail.practice.status, "draft");
        assert.equal((await service.list(student)).length, 0);
        await assert.rejects(
          async () => service.practice({ ...student, practiceId }),
          rejected("not-found"),
        );
        await assert.rejects(
          async () =>
            service.createSession({ ...actor, practiceId, ...values }),
          rejected("state"),
        );
        await service.updatePractice({
          ...actor,
          practiceId,
          title: "Torno",
          instructions: "Usa protección.",
        });
        await service.changePracticeStatus({
          ...actor,
          practiceId,
          status: "published",
        });
        assert.equal((await service.list(student)).length, 1);
      },
    );
    await context.test(
      "relations are revalidated and invalid creation is atomic",
      async () => {
        for (const bad of [
          { spaceId: spaceIds[1] },
          { teacherUserId: userIds[1] },
          { participantUserIds: [userIds[3]] },
        ])
          await assert.rejects(
            async () =>
              service.createSession({
                ...actor,
                practiceId,
                ...values,
                ...bad,
              }),
            rejected("relation"),
          );
        await db
          .update(users)
          .set({ isActive: false })
          .where(eq(users.id, userIds[1]));
        await assert.rejects(
          async () =>
            service.createSession({ ...actor, practiceId, ...values }),
          rejected("relation"),
        );
        await db
          .update(users)
          .set({ isActive: true })
          .where(eq(users.id, userIds[1]));
        assert.equal(
          (await service.practice({ ...actor, practiceId })).sessions.length,
          0,
        );
        const events = await db
          .select()
          .from(academicEvents)
          .where(eq(academicEvents.practiceId, practiceId));
        assert.ok(events.every((e) => e.sessionId === null));
      },
    );
    await context.test(
      "web programs a session, participants read only their context",
      async () => {
        const form = new FormData();
        form.set("spaceId", spaceIds[0]);
        form.set("teacherUserId", userIds[0]);
        form.set("startsLocal", "2026-10-05T14:00");
        form.set("endsLocal", "2026-10-05T16:00");
        form.append("participantUserIds", userIds[1]);
        sessionId = (await web.submit(slug, "create-session", practiceId, form))
          .sessionId!;
        sessionActor = userIds[1];
        const own = await web.session(slug, sessionId);
        assert.equal(own.isParticipant, true);
        assert.equal(own.canManage, false);
        assert.deepEqual(own.participants, []);
        assert.equal(
          own.session.startsAt.toISOString(),
          values.startsAt.replace("Z", ".000Z"),
        );
        await assert.rejects(
          web.submit(slug, "session-status", sessionId, new FormData()),
          AuthorizationDeniedError,
        );
        sessionActor = userIds[0];
        const noMember = { actorUserId: userIds[3], laboratoryId: labIds[0] };
        await assert.rejects(
          async () => service.session({ ...noMember, sessionId }),
          AuthorizationDeniedError,
        );
        await assert.rejects(
          async () =>
            service.session({ ...actor, laboratoryId: labIds[1], sessionId }),
          rejected("not-found"),
        );
        await assert.rejects(
          async () =>
            service.setParticipants({
              ...actor,
              sessionId,
              participantUserIds: [userIds[0]],
            }),
          rejected("own-participation"),
        );
      },
    );
    await context.test(
      "PostgreSQL rejects cross-laboratory foreign keys and duplicate participants",
      async () => {
        await assert.rejects(
          db.insert(labSessions).values({
            laboratoryId: labIds[0],
            practiceId,
            spaceId: spaceIds[1],
            teacherUserId: userIds[0],
            startsAt: new Date(values.startsAt),
            endsAt: new Date(values.endsAt),
          }),
          (e) => pgCode(e) === "23503",
        );
        await assert.rejects(
          db
            .insert(sessionParticipants)
            .values({ laboratoryId: labIds[0], sessionId, userId: userIds[3] }),
          (e) => pgCode(e) === "23503",
        );
        await assert.rejects(
          db
            .insert(sessionParticipants)
            .values({ laboratoryId: labIds[0], sessionId, userId: userIds[1] }),
          (e) => pgCode(e) === "23505",
        );
        await assert.rejects(
          db
            .update(labSessions)
            .set({ endsAt: new Date(values.startsAt) })
            .where(eq(labSessions.id, sessionId)),
          (e) => pgCode(e) === "23514",
        );
      },
    );
    await context.test(
      "student plus manager cannot alter their own academic participation",
      async () => {
        const member = members.find((m) => m.userId === userIds[1])!;
        await db
          .insert(membershipRoles)
          .values({ membershipId: member.id, roleId: roleIds[0] });
        const ownActor = { ...student, source: "API" };
        await assert.rejects(
          async () =>
            service.setParticipants({
              ...ownActor,
              sessionId,
              participantUserIds: [],
            }),
          rejected("own-participation"),
        );
        await assert.rejects(
          async () =>
            service.changeSessionStatus({
              ...ownActor,
              sessionId,
              status: "open",
            }),
          rejected("own-participation"),
        );
        await assert.rejects(
          async () =>
            service.updateSession({ ...ownActor, sessionId, ...values }),
          rejected("own-participation"),
        );
        await assert.rejects(
          async () =>
            service.updatePractice({
              ...ownActor,
              practiceId,
              title: "Changed",
              instructions: "Changed",
            }),
          rejected("own-participation"),
        );
        await db
          .delete(membershipRoles)
          .where(
            and(
              eq(membershipRoles.membershipId, member.id),
              eq(membershipRoles.roleId, roleIds[0]),
            ),
          );
      },
    );
    await context.test(
      "concurrent roster replacements serialize and audit actual previous roster",
      async () => {
        await Promise.all([
          service.setParticipants({
            ...actor,
            sessionId,
            participantUserIds: [userIds[1]],
          }),
          service.setParticipants({
            ...actor,
            sessionId,
            participantUserIds: [userIds[2]],
          }),
        ]);
        const detail = await service.session({ ...actor, sessionId });
        assert.equal(detail.participants.length, 1);
        const rows = await db
          .select()
          .from(academicEvents)
          .where(
            and(
              eq(academicEvents.sessionId, sessionId),
              eq(academicEvents.action, "participants.updated"),
            ),
          )
          .orderBy(academicEvents.createdAt);
        assert.equal(rows.length, 3);
        const snapshots = rows.map(
          (r) => r.snapshot as { before: string[]; after: string[] },
        );
        for (let i = 1; i < snapshots.length; i++)
          assert.deepEqual(snapshots[i].before, snapshots[i - 1].after);
        await service.setParticipants({
          ...actor,
          sessionId,
          participantUserIds: [userIds[1]],
        });
      },
    );
    await context.test(
      "revocation, inactive space and invalid times reject subsequent writes",
      async () => {
        const permission = catalog.find((p) => p.key === "academic.manage")!;
        await db
          .delete(rolePermissions)
          .where(
            and(
              eq(rolePermissions.roleId, roleIds[0]),
              eq(rolePermissions.permissionId, permission.id),
            ),
          );
        await assert.rejects(
          async () =>
            service.changeSessionStatus({
              ...actor,
              sessionId,
              status: "open",
            }),
          AuthorizationDeniedError,
        );
        await db
          .insert(rolePermissions)
          .values({ roleId: roleIds[0], permissionId: permission.id });
        await db
          .update(spaces)
          .set({ isActive: false })
          .where(eq(spaces.id, spaceIds[0]));
        await assert.rejects(
          async () =>
            service.changeSessionStatus({
              ...actor,
              sessionId,
              status: "open",
            }),
          rejected("relation"),
        );
        await db
          .update(spaces)
          .set({ isActive: true })
          .where(eq(spaces.id, spaceIds[0]));
        await assert.rejects(
          async () =>
            service.createSession({
              ...actor,
              practiceId,
              ...values,
              endsAt: values.startsAt,
            }),
          rejected("input"),
        );
      },
    );
    await context.test(
      "opening twice concurrently permits one transition; closed session keeps history",
      async () => {
        await assert.rejects(
          async () =>
            service.changePracticeStatus({
              ...actor,
              practiceId,
              status: "closed",
            }),
          rejected("state"),
        );
        const results = await Promise.allSettled([
          service.changeSessionStatus({ ...actor, sessionId, status: "open" }),
          service.changeSessionStatus({ ...actor, sessionId, status: "open" }),
        ]);
        assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
        assert.equal(results.filter((r) => r.status === "rejected").length, 1);
        await assert.rejects(
          async () =>
            service.setParticipants({
              ...actor,
              sessionId,
              participantUserIds: [],
            }),
          rejected("state"),
        );
        await service.changeSessionStatus({
          ...actor,
          sessionId,
          status: "closed",
        });
        assert.equal(
          (await service.session({ ...actor, sessionId })).participants.length,
          1,
        );
        await service.changePracticeStatus({
          ...actor,
          practiceId,
          status: "closed",
        });
        await assert.rejects(
          async () =>
            service.createSession({ ...actor, practiceId, ...values }),
          rejected("state"),
        );
        const events = await db
          .select()
          .from(academicEvents)
          .where(eq(academicEvents.practiceId, practiceId));
        assert.ok(
          events.every(
            (e) => e.actorUserId === userIds[0] && e.source === "WEB",
          ),
        );
        await assert.rejects(
          db
            .update(academicEvents)
            .set({ source: "AGENT" })
            .where(eq(academicEvents.id, events[0].id)),
          (e) => pgCode(e) === "23514",
        );
      },
    );
    await context.test(
      "closing a practice races session creation without leaving an active session in a closed practice",
      async () => {
        const p = await service.createPractice({
          ...actor,
          title: "Race",
          instructions: "Instructions",
        });
        await service.changePracticeStatus({
          ...actor,
          practiceId: p.id,
          status: "published",
        });
        const results = await Promise.allSettled([
          service.changePracticeStatus({
            ...actor,
            practiceId: p.id,
            status: "closed",
          }),
          service.createSession({ ...actor, practiceId: p.id, ...values }),
        ]);
        assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
        const detail = await service.practice({ ...actor, practiceId: p.id });
        assert.ok(
          detail.practice.status !== "closed" || detail.sessions.length === 0,
        );
      },
    );
  } finally {
    // Only synthetic fixtures in the guarded *_test database are removed.
    await db.transaction(async (tx) => {
      await tx
        .delete(academicEvents)
        .where(inArray(academicEvents.laboratoryId, labIds));
      await tx
        .delete(sessionParticipants)
        .where(inArray(sessionParticipants.laboratoryId, labIds));
      await tx
        .delete(labSessions)
        .where(inArray(labSessions.laboratoryId, labIds));
      await tx.delete(practices).where(inArray(practices.laboratoryId, labIds));
      await tx.delete(spaces).where(inArray(spaces.id, spaceIds));
      const memberships = await tx
        .select()
        .from(laboratoryMemberships)
        .where(inArray(laboratoryMemberships.userId, userIds));
      if (memberships.length)
        await tx.delete(membershipRoles).where(
          inArray(
            membershipRoles.membershipId,
            memberships.map((m) => m.id),
          ),
        );
      await tx
        .delete(laboratoryMemberships)
        .where(inArray(laboratoryMemberships.userId, userIds));
      await tx
        .delete(rolePermissions)
        .where(inArray(rolePermissions.roleId, roleIds));
      await tx.delete(roles).where(inArray(roles.id, roleIds));
      await tx.delete(laboratories).where(inArray(laboratories.id, labIds));
      await tx.delete(users).where(inArray(users.id, userIds));
    });
    await pool.end();
  }
});
