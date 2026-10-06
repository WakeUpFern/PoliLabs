import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../../src/infrastructure/database/schema";
import { prepareIntegrationDatabase } from "./database";
import { AcademicService } from "../../src/modules/academic/application/academic";
import { DrizzleAcademicStore } from "../../src/modules/academic/infrastructure/academic-store";
export async function operationFixture() {
  const pool = new Pool({
    connectionString: await prepareIntegrationDatabase(),
    max: 10,
  });
  const db = drizzle(pool, { schema });
  const suffix = randomUUID(),
    labIds = [randomUUID(), randomUUID()],
    userIds = [randomUUID(), randomUUID(), randomUUID()],
    roleIds = [randomUUID(), randomUUID()];
  await db.insert(schema.users).values(
    userIds.map((id, i) => ({
      id,
      name: `Operational ${i}`,
      email: `operations-${suffix}-${i}@invalid.test`,
    })),
  );
  await db.insert(schema.laboratories).values(
    labIds.map((id, i) => ({
      id,
      name: `Lab ${i}`,
      slug: `operations-${suffix}-${i}`,
    })),
  );
  await db.insert(schema.roles).values(
    roleIds.map((id, i) => ({
      id,
      key: `operations-${suffix}-${i}`,
      name: "Fixture",
      description: "Synthetic",
    })),
  );
  const catalog = await db.select().from(schema.permissions);
  const allowed = [
    "laboratory.read",
    "academic.read",
    "attendance.read",
    "attendance.checkin",
    "reservation.read",
    "reservation.create",
    "reservation.cancel",
  ];
  await db
    .insert(schema.rolePermissions)
    .values(
      catalog.flatMap((p) => [
        { roleId: roleIds[0], permissionId: p.id },
        ...(allowed.includes(p.key)
          ? [{ roleId: roleIds[1], permissionId: p.id }]
          : []),
      ]),
    );
  const members = await db
    .insert(schema.laboratoryMemberships)
    .values(
      userIds.flatMap((userId) =>
        labIds.map((laboratoryId) => ({ userId, laboratoryId })),
      ),
    )
    .returning();
  await db.insert(schema.membershipRoles).values(
    members.map((m) => ({
      membershipId: m.id,
      roleId: m.userId === userIds[0] ? roleIds[0] : roleIds[1],
    })),
  );
  const spaceRows = await db
    .insert(schema.spaces)
    .values([
      { laboratoryId: labIds[0], slug: "room-a", name: "Room A" },
      { laboratoryId: labIds[0], slug: "room-b", name: "Room B" },
      { laboratoryId: labIds[1], slug: "other", name: "Other" },
    ])
    .returning();
  const locationRows = await db
    .insert(schema.locations)
    .values(spaceRows.map((s) => ({ spaceId: s.id, name: "Mesa F" })))
    .returning();
  const resourceRows = await db
    .insert(schema.resources)
    .values(spaceRows.map((s) => ({ spaceId: s.id, name: "Machine" })))
    .returning();
  const actor = {
      actorUserId: userIds[0],
      laboratoryId: labIds[0],
      source: "WEB",
    },
    student = {
      actorUserId: userIds[1],
      laboratoryId: labIds[0],
      source: "WEB",
    };
  const academic = new AcademicService(new DrizzleAcademicStore(db));
  const practice = await academic.createPractice({
    ...actor,
    title: "Practice",
    instructions: "Instructions",
  });
  await academic.changePracticeStatus({
    ...actor,
    practiceId: practice.id,
    status: "published",
  });
  async function session(
    spaceId = spaceRows[0].id,
    participants = [userIds[1]],
  ) {
    return academic.createSession({
      ...actor,
      practiceId: practice.id,
      spaceId,
      teacherUserId: userIds[0],
      startsAt: "2026-10-06T14:00:00Z",
      endsAt: "2026-10-06T16:00:00Z",
      participantUserIds: participants,
    });
  }
  async function cleanup() {
    await db.transaction(async (tx) => {
      const ss = await tx
        .select({ id: schema.labSessions.id })
        .from(schema.labSessions)
        .where(inArray(schema.labSessions.laboratoryId, labIds));
      const ids = ss.map((s) => s.id);
      if (ids.length) {
        const aa = await tx
          .select({ id: schema.attendance.id })
          .from(schema.attendance)
          .where(inArray(schema.attendance.sessionId, ids));
        if (aa.length)
          await tx.delete(schema.attendanceEvents).where(
            inArray(
              schema.attendanceEvents.attendanceId,
              aa.map((a) => a.id),
            ),
          );
        await tx
          .delete(schema.attendance)
          .where(inArray(schema.attendance.sessionId, ids));
      }
      const reservations = await tx
        .select({ id: schema.reservations.id })
        .from(schema.reservations)
        .where(inArray(schema.reservations.createdBy, userIds));
      if (reservations.length)
        await tx.delete(schema.reservationResources).where(
          inArray(
            schema.reservationResources.reservationId,
            reservations.map((r) => r.id),
          ),
        );
      await tx
        .delete(schema.reservations)
        .where(inArray(schema.reservations.createdBy, userIds));
      await tx
        .delete(schema.academicEvents)
        .where(inArray(schema.academicEvents.laboratoryId, labIds));
      await tx
        .delete(schema.sessionParticipants)
        .where(inArray(schema.sessionParticipants.laboratoryId, labIds));
      await tx
        .delete(schema.labSessions)
        .where(inArray(schema.labSessions.laboratoryId, labIds));
      await tx
        .delete(schema.practices)
        .where(inArray(schema.practices.laboratoryId, labIds));
      await tx.delete(schema.resources).where(
        inArray(
          schema.resources.id,
          resourceRows.map((r) => r.id),
        ),
      );
      await tx.delete(schema.locations).where(
        inArray(
          schema.locations.id,
          locationRows.map((r) => r.id),
        ),
      );
      await tx.delete(schema.spaces).where(
        inArray(
          schema.spaces.id,
          spaceRows.map((r) => r.id),
        ),
      );
      await tx.delete(schema.membershipRoles).where(
        inArray(
          schema.membershipRoles.membershipId,
          members.map((m) => m.id),
        ),
      );
      await tx
        .delete(schema.laboratoryMemberships)
        .where(inArray(schema.laboratoryMemberships.userId, userIds));
      await tx
        .delete(schema.rolePermissions)
        .where(inArray(schema.rolePermissions.roleId, roleIds));
      await tx.delete(schema.roles).where(inArray(schema.roles.id, roleIds));
      await tx
        .delete(schema.laboratories)
        .where(inArray(schema.laboratories.id, labIds));
      await tx.delete(schema.users).where(inArray(schema.users.id, userIds));
    });
    await pool.end();
  }
  return {
    pool,
    db,
    schema,
    labIds,
    userIds,
    roleIds,
    members,
    catalog,
    spaceRows,
    locationRows,
    resourceRows,
    actor,
    student,
    academic,
    session,
    cleanup,
    slug: `operations-${suffix}-0`,
  };
}
export function pgCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return;
  if ("code" in error) return String(error.code);
  if ("cause" in error) return pgCode(error.cause);
}
export { and, eq, inArray };
