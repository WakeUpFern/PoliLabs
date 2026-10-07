/** Start a production preview against the guarded *_test database with synthetic identities. */
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { and, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../../src/infrastructure/database/schema";
import { INITIAL_PERMISSION_LIST } from "../../src/modules/identity/domain/access-catalog";
import { prepareIntegrationDatabase } from "../integration/database";
import { createBootstrapAuth } from "../../src/modules/identity/infrastructure/bootstrap-auth";
import { CreateInventoryItem } from "../../src/modules/inventory/application/inventory";
import { DrizzleInventoryStore } from "../../src/modules/inventory/infrastructure/inventory-store";
import { IncidentService } from "../../src/modules/incidents/application/incidents";
import { DrizzleIncidentStore } from "../../src/modules/incidents/infrastructure/incident-store";

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
  inventoryItems,
  inventoryStocks,
  inventoryMovements,
  inventoryEvents,
  incidentReports,
  incidentEvents,
  maintenanceLogs,
  maintenanceMaterials,
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
  const slug = `maintenance-browser-${suffix}`;
  const password = "Synthetic-maintenance-browser-2026!";
  let child: ReturnType<typeof spawn> | undefined;
  try {
    const auth = createBootstrapAuth(db);
    for (const name of ["Responsable", "Alumno"]) {
      const email = `maintenance-browser-${name.toLowerCase()}-${suffix}@invalid.test`;
      const result = await auth.api.signUpEmail({
        body: { name: `${name} de prueba`, email, password },
      });
      userIds.push(result.user.id);
    }
    await db.insert(laboratories).values({
      id: labId,
      slug,
      name: "Laboratorio de mantenimiento de prueba",
    });
    await db.insert(roles).values(
      roleIds.map((id, i) => ({
        id,
        key: `maintenance-browser-${suffix}-${i}`,
        name: "Rol de prueba",
        description: "Synthetic browser fixture",
      })),
    );
    const shared = [
      "laboratory.read",
      "space.read",
      "resource.read",
      "location.read",
      "incident.create",
      "incident.read",
      "reservation.read",
      "reservation.create",
      "reservation.cancel",
    ];
    const managerOnly = [
      "maintenance.read",
      "maintenance.create",
      "inventory.read",
      "inventory.manage",
      "inventory.adjust",
      "incident.review",
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
    await new CreateInventoryItem(new DrizzleInventoryStore(db)).execute({
      actorUserId: userIds[0],
      laboratoryId: labId,
      source: "SYSTEM",
      name: "Aceite de prueba",
      type: "consumable",
      unit: "litre",
      initialQuantity: "5",
      notes: "Existencia sintética",
    });
    await new IncidentService(new DrizzleIncidentStore(db)).report({
      actorUserId: userIds[1],
      laboratoryId: labId,
      source: "SYSTEM",
      targetKind: "resource",
      targetId: lathe.id,
      description: "Ruido anormal en el cabezal",
      severity: "medium",
    });
    child = spawn("pnpm", ["start", "--port", "3109"], {
      stdio: "inherit",
      env: {
        ...process.env,
        DATABASE_URL: url,
        BETTER_AUTH_URL: "http://localhost:3109",
      },
    });
    console.log(
      JSON.stringify({
        fixturePid: process.pid,
        baseURL: "http://localhost:3109",
        slug,
        labPath: `/app/labs/${slug}`,
        maintenancePath: `/app/labs/${slug}/maintenance`,
        resourcePath: `/app/labs/${slug}/maintenance/resources/${lathe.id}`,
        spacePath: `/app/labs/${slug}/spaces/${space.slug}`,
        reservationPath: `/app/labs/${slug}/reservations/new`,
        managerEmail: `maintenance-browser-responsable-${suffix}@invalid.test`,
        studentEmail: `maintenance-browser-alumno-${suffix}@invalid.test`,
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
      child.kill("SIGTERM");
      await once(child, "exit");
    }
    await db.transaction(async (tx) => {
      await tx
        .delete(maintenanceMaterials)
        .where(eq(maintenanceMaterials.laboratoryId, labId));
      await tx
        .delete(maintenanceLogs)
        .where(eq(maintenanceLogs.laboratoryId, labId));
      const items = await tx
        .select({ id: inventoryItems.id })
        .from(inventoryItems)
        .where(eq(inventoryItems.laboratoryId, labId));
      if (items.length) {
        // Inventory history may only disappear together with its synthetic item.
        const itemIds = items.map((i) => i.id);
        await tx
          .delete(inventoryMovements)
          .where(inArray(inventoryMovements.itemId, itemIds));
        await tx
          .delete(inventoryEvents)
          .where(inArray(inventoryEvents.itemId, itemIds));
        await tx
          .delete(inventoryStocks)
          .where(inArray(inventoryStocks.itemId, itemIds));
        await tx
          .delete(inventoryItems)
          .where(inArray(inventoryItems.id, itemIds));
      }
      const incidentRows = await tx
        .select({ id: incidentReports.id })
        .from(incidentReports)
        .where(eq(incidentReports.laboratoryId, labId));
      if (incidentRows.length) {
        await tx.delete(incidentEvents).where(
          inArray(
            incidentEvents.incidentId,
            incidentRows.map((r) => r.id),
          ),
        );
        await tx
          .delete(incidentReports)
          .where(eq(incidentReports.laboratoryId, labId));
      }
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
    console.log("Synthetic Maintenance browser fixtures removed.");
  }
}
main().catch(() => {
  console.error(
    "Maintenance browser fixture failed; no connection details were logged.",
  );
  process.exitCode = 1;
});
