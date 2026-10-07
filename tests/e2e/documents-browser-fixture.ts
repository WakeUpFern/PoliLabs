/** Start a production preview against the guarded *_test database with synthetic identities. */
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { and, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../../src/infrastructure/database/schema";
import { INITIAL_PERMISSION_LIST } from "../../src/modules/identity/domain/access-catalog";
import { prepareIntegrationDatabase } from "../integration/database";
import { createBootstrapAuth } from "../../src/modules/identity/infrastructure/bootstrap-auth";
import { MaintenanceService } from "../../src/modules/maintenance/application/maintenance";
import { DrizzleMaintenanceStore } from "../../src/modules/maintenance/infrastructure/maintenance-store";

const {
  users,
  accounts,
  sessions,
  laboratories,
  laboratoryMemberships,
  roles,
  permissions,
  rolePermissions,
  membershipRoles,
  spaces,
  resources,
  reservations,
  reservationResources,
  maintenanceLogs,
  maintenanceMaterials,
  documents,
} = schema;

async function main() {
  const url = await prepareIntegrationDatabase();
  if (!new URL(url).pathname.endsWith("_test"))
    throw new Error("Test database required");
  const pool = new Pool({ connectionString: url });
  const db = drizzle(pool, { schema });
  await db
    .insert(permissions)
    .values(INITIAL_PERMISSION_LIST)
    .onConflictDoNothing();
  const suffix = randomUUID(),
    labId = randomUUID(),
    roleIds = [randomUUID(), randomUUID()],
    userIds: string[] = [];
  const slug = `documents-browser-${suffix}`;
  const password = "Synthetic-documents-browser-2026!";
  // Objects of this fixture live in a temporary directory removed on exit.
  const storageDir = await mkdtemp(join(tmpdir(), "labora-documents-e2e-"));
  let child: ReturnType<typeof spawn> | undefined;
  try {
    const auth = createBootstrapAuth(db);
    for (const name of ["Responsable", "Alumno"]) {
      const email = `documents-browser-${name.toLowerCase()}-${suffix}@invalid.test`;
      const result = await auth.api.signUpEmail({
        body: { name: `${name} de prueba`, email, password },
      });
      userIds.push(result.user.id);
    }
    await db.insert(laboratories).values({
      id: labId,
      slug,
      name: "Laboratorio de documentos de prueba",
    });
    await db.insert(roles).values(
      roleIds.map((id, i) => ({
        id,
        key: `documents-browser-${suffix}-${i}`,
        name: "Rol de prueba",
        description: "Synthetic browser fixture",
      })),
    );
    const shared = [
      "laboratory.read",
      "space.read",
      "resource.read",
      "location.read",
    ];
    const managerOnly = [
      "maintenance.read",
      "maintenance.create",
      "document.read",
      "document.upload",
      "document.archive",
    ];
    const catalog = await db
      .select()
      .from(permissions)
      .where(inArray(permissions.key, [...shared, ...managerOnly]));
    await db
      .insert(rolePermissions)
      .values(
        catalog.flatMap((p) =>
          managerOnly.includes(p.key)
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
        roleId: roleIds[userIds.indexOf(m.userId) === 0 ? 0 : 1],
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
    const [lathe] = await db
      .insert(resources)
      .values([
        { spaceId: space.id, name: "Torno de prueba" },
        { spaceId: space.id, name: "Fresadora de prueba" },
      ])
      .returning();
    const log = await new MaintenanceService(
      new DrizzleMaintenanceStore(db),
    ).record({
      actorUserId: userIds[0],
      laboratoryId: labId,
      source: "SYSTEM",
      resourceId: lathe.id,
      type: "corrective",
      description: "Bitácora escrita a mano por el profesor",
      statusAfter: "operational",
      performedAt: new Date(Date.now() - 3600000).toISOString(),
    });
    // Own process group so cleanup also stops the next-server grandchild.
    child = spawn("pnpm", ["start", "--port", "3110"], {
      stdio: "inherit",
      detached: true,
      env: {
        ...process.env,
        DATABASE_URL: url,
        BETTER_AUTH_URL: "http://localhost:3110",
        DOCUMENT_STORAGE_DIR: storageDir,
      },
    });
    console.log(
      JSON.stringify({
        fixturePid: process.pid,
        baseURL: "http://localhost:3110",
        slug,
        labPath: `/app/labs/${slug}`,
        documentsPath: `/app/labs/${slug}/resources/${lathe.id}/documents`,
        maintenancePath: `/app/labs/${slug}/maintenance/resources/${lathe.id}`,
        uploadPath: `/app/labs/${slug}/documents`,
        spacePath: `/app/labs/${slug}/spaces/${space.slug}`,
        resourceId: lathe.id,
        maintenanceLogId: log.id,
        managerEmail: `documents-browser-responsable-${suffix}@invalid.test`,
        studentEmail: `documents-browser-alumno-${suffix}@invalid.test`,
        password,
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
      process.kill(-child.pid!, "SIGTERM");
      await once(child, "exit");
    }
    await db.transaction(async (tx) => {
      await tx.delete(documents).where(eq(documents.laboratoryId, labId));
      await tx
        .delete(maintenanceMaterials)
        .where(eq(maintenanceMaterials.laboratoryId, labId));
      await tx
        .delete(maintenanceLogs)
        .where(eq(maintenanceLogs.laboratoryId, labId));
      const spaceIds = (
        await tx
          .select({ id: spaces.id })
          .from(spaces)
          .where(eq(spaces.laboratoryId, labId))
      ).map((s) => s.id);
      const reservationRows = spaceIds.length
        ? await tx
            .select({ id: reservations.id })
            .from(reservations)
            .where(inArray(reservations.spaceId, spaceIds))
        : [];
      if (reservationRows.length) {
        await tx.delete(reservationResources).where(
          inArray(
            reservationResources.reservationId,
            reservationRows.map((r) => r.id),
          ),
        );
        await tx.delete(reservations).where(
          inArray(
            reservations.id,
            reservationRows.map((r) => r.id),
          ),
        );
      }
      if (spaceIds.length)
        await tx.delete(resources).where(inArray(resources.spaceId, spaceIds));
      await tx.delete(spaces).where(eq(spaces.laboratoryId, labId));
      const memberRows = await tx
        .select()
        .from(laboratoryMemberships)
        .where(
          and(
            eq(laboratoryMemberships.laboratoryId, labId),
            inArray(laboratoryMemberships.userId, userIds),
          ),
        );
      if (memberRows.length)
        await tx.delete(membershipRoles).where(
          inArray(
            membershipRoles.membershipId,
            memberRows.map((m) => m.id),
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
    await rm(storageDir, { recursive: true, force: true });
    console.log("Synthetic Documents browser fixtures removed.");
  }
}
main().catch(() => {
  console.error(
    "Documents browser fixture failed; no connection details were logged.",
  );
  process.exitCode = 1;
});
