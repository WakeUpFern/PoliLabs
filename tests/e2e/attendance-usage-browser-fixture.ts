/** Start a production preview against the guarded *_test database with synthetic identities. */
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { and, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../../src/infrastructure/database/schema";
import { AcademicService } from "../../src/modules/academic/application/academic";
import { DrizzleAcademicStore } from "../../src/modules/academic/infrastructure/academic-store";
import { prepareIntegrationDatabase } from "../integration/database";
import { createBootstrapAuth } from "../../src/modules/identity/infrastructure/bootstrap-auth";
import {
  users,
  accounts,
  sessions,
} from "../../src/modules/identity/infrastructure/auth-schema";
import {
  laboratories,
  laboratoryMemberships,
  roles,
  permissions,
  rolePermissions,
  membershipRoles,
} from "../../src/modules/identity/infrastructure/access-schema";
import {
  attendance,
  attendanceEvents,
} from "../../src/modules/attendance/infrastructure/attendance-schema";
import {
  resourceUsage,
  usageEvents,
} from "../../src/modules/usage/infrastructure/usage-schema";
import {
  spaces,
  locations,
  resources,
} from "../../src/modules/spatial/infrastructure/spatial-schema";
import {
  practices,
  labSessions,
  sessionParticipants,
  academicEvents,
} from "../../src/modules/academic/infrastructure/academic-schema";

async function main() {
  const url = await prepareIntegrationDatabase();
  if (!new URL(url).pathname.endsWith("_test"))
    throw new Error("Test database required");
  const pool = new Pool({ connectionString: url });
  const db = drizzle(pool, { schema });
  const suffix = randomUUID(),
    labId = randomUUID(),
    roleIds = [randomUUID(), randomUUID()],
    userIds: string[] = [];
  const slug = `attendance-usage-browser-${suffix}`;
  const password = "Synthetic-attendance-usage-browser-2026!";
  let child: ReturnType<typeof spawn> | undefined;
  try {
    const auth = createBootstrapAuth(db);
    for (const name of ["Responsable", "Alumno"]) {
      const email = `attendance-usage-browser-${name.toLowerCase()}-${suffix}@invalid.test`;
      const result = await auth.api.signUpEmail({
        body: { name: `${name} de prueba`, email, password },
      });
      userIds.push(result.user.id);
    }
    await db
      .insert(laboratories)
      .values({ id: labId, slug, name: "Laboratorio académico de prueba" });
    await db.insert(roles).values(
      roleIds.map((id, i) => ({
        id,
        key: `attendance-usage-browser-${suffix}-${i}`,
        name: "Rol de prueba",
        description: "Synthetic browser fixture",
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
          "attendance.read",
          "attendance.checkin",
          "attendance.manage",
          "usage.read",
          "usage.record",
          "usage.trace",
        ]),
      );
    await db
      .insert(rolePermissions)
      .values(
        catalog.flatMap((p) =>
          ["academic.manage", "attendance.manage", "usage.trace"].includes(
            p.key,
          )
            ? [{ roleId: roleIds[0], permissionId: p.id }]
            : roleIds.map((roleId) => ({ roleId, permissionId: p.id })),
        ),
      );
    const members = await db
      .insert(laboratoryMemberships)
      .values(userIds.map((userId) => ({ userId, laboratoryId: labId })))
      .returning();
    await db.insert(membershipRoles).values(
      members.map((m) => ({
        membershipId: m.id,
        roleId: roleIds[userIds.indexOf(m.userId)],
      })),
    );
    const [space] = await db
      .insert(spaces)
      .values({
        laboratoryId: labId,
        slug: "area-maquinas",
        name: "Área de máquinas de prueba",
      })
      .returning();
    const academic = new AcademicService(new DrizzleAcademicStore(db));
    const actor = {
      actorUserId: userIds[0],
      laboratoryId: labId,
      source: "SYSTEM",
    };
    const practice = await academic.createPractice({
      ...actor,
      title: "Operación básica de torno",
      instructions:
        "Revisar las protecciones y consultar el manual antes de comenzar.",
    });
    await academic.changePracticeStatus({
      ...actor,
      practiceId: practice.id,
      status: "published",
    });
    const session = await academic.createSession({
      ...actor,
      practiceId: practice.id,
      spaceId: space.id,
      teacherUserId: userIds[0],
      startsAt: "2026-10-06T20:00:00Z",
      endsAt: "2026-10-06T22:00:00Z",
      participantUserIds: [userIds[1]],
    });
    const [location] = await db
      .insert(locations)
      .values({ spaceId: space.id, name: "Mesa F" })
      .returning();
    const [resource] = await db
      .insert(resources)
      .values({
        spaceId: space.id,
        locationId: location.id,
        name: "Torno de prueba",
      })
      .returning();
    await academic.changeSessionStatus({
      ...actor,
      sessionId: session.id,
      status: "open",
    });
    child = spawn("pnpm", ["start", "--port", "3108"], {
      stdio: "inherit",
      env: {
        ...process.env,
        DATABASE_URL: url,
        BETTER_AUTH_URL: "http://localhost:3108",
      },
    });
    console.log(
      JSON.stringify({
        fixturePid: process.pid,
        baseURL: "http://localhost:3108",
        slug,
        checkInPath: `/check-in/${slug}/${location.id}`,
        usagePath: `/app/labs/${slug}/usage`,
        rosterPath: `/app/labs/${slug}/attendance/sessions/${session.id}`,
        tracePath: `/app/labs/${slug}/usage/resources/${resource.id}`,
        managerEmail: `attendance-usage-browser-responsable-${suffix}@invalid.test`,
        studentEmail: `attendance-usage-browser-alumno-${suffix}@invalid.test`,
        password,
        sessionPath: `/app/labs/${slug}/academic/sessions/${session.id}`,
      }),
    );
    // Keep the fixture alive during browser inspection. SIGINT/SIGTERM stop the preview and clean only these fixtures.
    await Promise.race([
      once(process, "SIGINT"),
      once(process, "SIGTERM"),
      once(child, "exit"),
    ]);
  } finally {
    if (child && child.exitCode === null) {
      child.kill("SIGTERM");
      await once(child, "exit");
    }
    await db.transaction(async (tx) => {
      const sessionRows = await tx
        .select({ id: labSessions.id })
        .from(labSessions)
        .where(eq(labSessions.laboratoryId, labId));
      if (sessionRows.length) {
        const aa = await tx
          .select({ id: attendance.id })
          .from(attendance)
          .where(
            inArray(
              attendance.sessionId,
              sessionRows.map((s) => s.id),
            ),
          );
        if (aa.length)
          await tx.delete(attendanceEvents).where(
            inArray(
              attendanceEvents.attendanceId,
              aa.map((a) => a.id),
            ),
          );
        await tx.delete(attendance).where(
          inArray(
            attendance.sessionId,
            sessionRows.map((s) => s.id),
          ),
        );
        const uu = await tx
          .select({ id: resourceUsage.id })
          .from(resourceUsage)
          .where(
            inArray(
              resourceUsage.sessionId,
              sessionRows.map((s) => s.id),
            ),
          );
        if (uu.length)
          await tx.delete(usageEvents).where(
            inArray(
              usageEvents.usageId,
              uu.map((u) => u.id),
            ),
          );
        await tx.delete(resourceUsage).where(
          inArray(
            resourceUsage.sessionId,
            sessionRows.map((s) => s.id),
          ),
        );
      }
      const sp = await tx
        .select({ id: spaces.id })
        .from(spaces)
        .where(eq(spaces.laboratoryId, labId));
      if (sp.length) {
        await tx.delete(resources).where(
          inArray(
            resources.spaceId,
            sp.map((s) => s.id),
          ),
        );
        await tx.delete(locations).where(
          inArray(
            locations.spaceId,
            sp.map((s) => s.id),
          ),
        );
      }

      await tx
        .delete(academicEvents)
        .where(eq(academicEvents.laboratoryId, labId));
      await tx
        .delete(sessionParticipants)
        .where(eq(sessionParticipants.laboratoryId, labId));
      await tx.delete(labSessions).where(eq(labSessions.laboratoryId, labId));
      await tx.delete(practices).where(eq(practices.laboratoryId, labId));
      await tx.delete(spaces).where(eq(spaces.laboratoryId, labId));
      const members = await tx
        .select()
        .from(laboratoryMemberships)
        .where(
          and(
            eq(laboratoryMemberships.laboratoryId, labId),
            inArray(laboratoryMemberships.userId, userIds),
          ),
        );
      if (members.length)
        await tx.delete(membershipRoles).where(
          inArray(
            membershipRoles.membershipId,
            members.map((m) => m.id),
          ),
        );
      await tx
        .delete(laboratoryMemberships)
        .where(eq(laboratoryMemberships.laboratoryId, labId));
      await tx
        .delete(rolePermissions)
        .where(inArray(rolePermissions.roleId, roleIds));
      await tx.delete(roles).where(inArray(roles.id, roleIds));
      await tx.delete(laboratories).where(eq(laboratories.id, labId));
      if (userIds.length) {
        await tx.delete(sessions).where(inArray(sessions.userId, userIds));
        await tx.delete(accounts).where(inArray(accounts.userId, userIds));
        await tx.delete(users).where(inArray(users.id, userIds));
      }
    });
    await pool.end();
    console.log("Synthetic Attendance/Usage browser fixtures removed.");
  }
}
main().catch(() => {
  console.error(
    "Attendance/Usage browser fixture failed; no connection details were logged.",
  );
  process.exitCode = 1;
});
