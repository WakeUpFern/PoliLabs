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
import { LoanService } from "../../src/modules/loans/application/loans";
import { DrizzleLoanStore } from "../../src/modules/loans/infrastructure/loan-store";

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
  inventoryItems,
  inventoryStocks,
  inventoryMovements,
  inventoryEvents,
  inventoryLoans,
  inventoryLoanReturns,
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
  const slug = `loans-browser-${suffix}`;
  const password = "Synthetic-loans-browser-2026!";
  let child: ReturnType<typeof spawn> | undefined;
  try {
    const auth = createBootstrapAuth(db);
    for (const name of ["Responsable", "Alumno"]) {
      const email = `loans-browser-${name.toLowerCase()}-${suffix}@invalid.test`;
      const result = await auth.api.signUpEmail({
        body: { name: `${name} de prueba`, email, password },
      });
      userIds.push(result.user.id);
    }
    await db.insert(laboratories).values({
      id: labId,
      slug,
      name: "Laboratorio de préstamos de prueba",
    });
    await db.insert(roles).values(
      roleIds.map((id, i) => ({
        id,
        key: `loans-browser-${suffix}-${i}`,
        name: "Rol de prueba",
        description: "Synthetic browser fixture",
      })),
    );
    const shared = ["laboratory.read", "inventory.loan.read"];
    const managerOnly = [
      "inventory.read",
      "inventory.manage",
      "inventory.adjust",
      "inventory.loan",
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
    const manager = {
      actorUserId: userIds[0],
      laboratoryId: labId,
      source: "SYSTEM",
    };
    const create = new CreateInventoryItem(new DrizzleInventoryStore(db));
    const pliers = await create.execute({
      ...manager,
      name: "Pinzas de prueba",
      type: "reusable_tool",
      unit: "piece",
      initialQuantity: "5",
      notes: "Existencia sintética",
    });
    await create.execute({
      ...manager,
      name: "Aceite de prueba",
      type: "consumable",
      unit: "litre",
      initialQuantity: "5",
      notes: "Existencia sintética",
    });
    // Due shortly so the overdue filter can be observed during the walkthrough.
    await new LoanService(new DrizzleLoanStore(db)).lend({
      ...manager,
      itemId: pliers.id,
      borrowerUserId: userIds[1],
      quantity: "2",
      dueAt: new Date(Date.now() + 120000).toISOString(),
      notes: "Préstamo sintético con vencimiento cercano",
    });
    // Own process group: pnpm does not forward signals to next-server.
    child = spawn("pnpm", ["start", "--port", "3111"], {
      stdio: "inherit",
      detached: true,
      env: {
        ...process.env,
        DATABASE_URL: url,
        BETTER_AUTH_URL: "http://localhost:3111",
      },
    });
    console.log(
      JSON.stringify({
        fixturePid: process.pid,
        baseURL: "http://localhost:3111",
        slug,
        labPath: `/app/labs/${slug}`,
        loansPath: `/app/labs/${slug}/loans`,
        itemPath: `/app/labs/${slug}/inventory/${pliers.id}`,
        managerEmail: `loans-browser-responsable-${suffix}@invalid.test`,
        studentEmail: `loans-browser-alumno-${suffix}@invalid.test`,
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
    if (child?.pid && child.exitCode === null) {
      process.kill(-child.pid, "SIGTERM");
      await once(child, "exit");
    }
    await db.transaction(async (tx) => {
      // Loan history may only disappear together with its synthetic items.
      await tx
        .delete(inventoryLoanReturns)
        .where(eq(inventoryLoanReturns.laboratoryId, labId));
      await tx
        .delete(inventoryLoans)
        .where(eq(inventoryLoans.laboratoryId, labId));
      const items = await tx
        .select({ id: inventoryItems.id })
        .from(inventoryItems)
        .where(eq(inventoryItems.laboratoryId, labId));
      if (items.length) {
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
    console.log("Synthetic Loans browser fixtures removed.");
  }
}
main().catch(() => {
  console.error(
    "Loans browser fixture failed; no connection details were logged.",
  );
  process.exitCode = 1;
});
