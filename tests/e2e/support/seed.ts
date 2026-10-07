import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../../../src/infrastructure/database/schema";
import { INITIAL_PERMISSION_LIST } from "../../../src/modules/identity/domain/access-catalog";
import { createBootstrapAuth } from "../../../src/modules/identity/infrastructure/bootstrap-auth";
import { CreateInventoryItem } from "../../../src/modules/inventory/application/inventory";
import { DrizzleInventoryStore } from "../../../src/modules/inventory/infrastructure/inventory-store";
import { prepareIntegrationDatabase } from "../../integration/database";
import { E2E_PASSWORD } from "./constants";

export type SeedUser = { key: string; name: string; permissions: string[] };
export type SeedItem = {
  name: string;
  type: "consumable" | "reusable_tool";
  unit: "piece" | "metre" | "litre" | "kilogram";
  quantity: string;
};
export type SessionCookie = {
  name: string;
  value: string;
  domain: string;
  path: string;
  httpOnly: boolean;
  sameSite: "Lax";
};
export type SeededUser = {
  id: string;
  email: string;
  name: string;
  cookies: SessionCookie[];
};
export type SeededLaboratory = Awaited<ReturnType<typeof seedLaboratory>>;

/**
 * Creates one isolated synthetic laboratory in the guarded *_test database:
 * accounts on invalid.test with explicit permissions, a space with resources
 * and inventory items. Each spec seeds its own laboratory and removes it.
 */
export async function seedLaboratory(input: {
  prefix: string;
  users: SeedUser[];
  resources: string[];
  items?: SeedItem[];
}) {
  const url = await prepareIntegrationDatabase();
  if (!new URL(url).pathname.endsWith("_test"))
    throw new Error("Test database required");
  const pool = new Pool({ connectionString: url, max: 4 });
  const db = drizzle(pool, { schema });
  const suffix = randomUUID();
  const labId = randomUUID();
  const slug = `${input.prefix}-${suffix}`;
  const users: Record<string, SeededUser> = {};
  const roleIds: string[] = [];
  const cleanup = () => removeLaboratory(db, pool, labId, roleIds, users);
  try {
    await db
      .insert(schema.permissions)
      .values(INITIAL_PERMISSION_LIST)
      .onConflictDoNothing();
    const auth = createBootstrapAuth(db);
    for (const user of input.users) {
      const email = `${input.prefix}-${user.key}-${suffix}@invalid.test`;
      const result = await auth.api.signUpEmail({
        body: { name: user.name, email, password: E2E_PASSWORD },
      });
      // Sessions are issued in-process: repeated UI sign-ins would trip the
      // sign-in rate limit, which stays enabled. One spec covers the login form.
      const signedIn = await auth.api.signInEmail({
        body: { email, password: E2E_PASSWORD },
        returnHeaders: true,
      });
      users[user.key] = {
        id: result.user.id,
        email,
        name: user.name,
        cookies: signedIn.headers.getSetCookie().map((header) => {
          const [pair] = header.split(";");
          const index = pair.indexOf("=");
          return {
            name: pair.slice(0, index),
            value: pair.slice(index + 1),
            domain: "localhost",
            path: "/",
            httpOnly: true,
            sameSite: "Lax" as const,
          };
        }),
      };
    }
    await db
      .insert(schema.laboratories)
      .values({ id: labId, slug, name: "Laboratorio e2e" });
    const catalog = await db.select().from(schema.permissions);
    for (const user of input.users) {
      const roleId = randomUUID();
      roleIds.push(roleId);
      await db.insert(schema.roles).values({
        id: roleId,
        key: `${input.prefix}-${user.key}-${suffix}`,
        name: "Rol e2e",
        description: "Synthetic e2e role",
      });
      const granted = catalog.filter((p) =>
        ["laboratory.read", ...user.permissions].includes(p.key),
      );
      await db
        .insert(schema.rolePermissions)
        .values(granted.map((p) => ({ roleId, permissionId: p.id })));
      const [membership] = await db
        .insert(schema.laboratoryMemberships)
        .values({ userId: users[user.key].id, laboratoryId: labId })
        .returning();
      await db
        .insert(schema.membershipRoles)
        .values({ membershipId: membership.id, roleId });
    }
    const [space] = await db
      .insert(schema.spaces)
      .values({
        laboratoryId: labId,
        slug: "area-maquinas",
        name: "Área de máquinas e2e",
      })
      .returning();
    const resources = input.resources.length
      ? await db
          .insert(schema.resources)
          .values(input.resources.map((name) => ({ spaceId: space.id, name })))
          .returning()
      : [];
    const inventory = new CreateInventoryItem(new DrizzleInventoryStore(db));
    const items = [];
    for (const item of input.items ?? []) {
      // Seeded by the first user, who must hold inventory.manage and adjust.
      items.push(
        await inventory.execute({
          actorUserId: users[input.users[0].key].id,
          laboratoryId: labId,
          source: "SYSTEM",
          name: item.name,
          type: item.type,
          unit: item.unit,
          initialQuantity: item.quantity,
          notes: "Existencia sintética e2e",
        }),
      );
    }
    return {
      db,
      labId,
      slug,
      users,
      space,
      resources: Object.fromEntries(resources.map((r) => [r.name, r])),
      items: Object.fromEntries(items.map((i) => [i.name, i])),
      cleanup,
    };
  } catch (error) {
    await cleanup();
    throw error;
  }
}

// Removes only rows of this synthetic laboratory, children before parents, in
// one transaction (inventory and loan history may only go with their item).
async function removeLaboratory(
  db: ReturnType<typeof drizzle<typeof schema>>,
  pool: Pool,
  labId: string,
  roleIds: string[],
  users: Record<string, SeededUser>,
) {
  const s = schema;
  const userIds = Object.values(users).map((u) => u.id);
  try {
    await db.transaction(async (tx) => {
      await tx.delete(s.documents).where(eq(s.documents.laboratoryId, labId));
      await tx
        .delete(s.maintenanceMaterials)
        .where(eq(s.maintenanceMaterials.laboratoryId, labId));
      await tx
        .delete(s.maintenanceLogs)
        .where(eq(s.maintenanceLogs.laboratoryId, labId));
      const items = (
        await tx
          .select({ id: s.inventoryItems.id })
          .from(s.inventoryItems)
          .where(eq(s.inventoryItems.laboratoryId, labId))
      ).map((i) => i.id);
      if (items.length) {
        await tx
          .delete(s.inventoryLoanReturns)
          .where(eq(s.inventoryLoanReturns.laboratoryId, labId));
        await tx
          .delete(s.inventoryLoans)
          .where(eq(s.inventoryLoans.laboratoryId, labId));
        await tx
          .delete(s.inventoryMovements)
          .where(inArray(s.inventoryMovements.itemId, items));
        await tx
          .delete(s.inventoryEvents)
          .where(inArray(s.inventoryEvents.itemId, items));
        await tx
          .delete(s.inventoryStocks)
          .where(inArray(s.inventoryStocks.itemId, items));
        await tx
          .delete(s.inventoryItems)
          .where(inArray(s.inventoryItems.id, items));
      }
      const incidents = (
        await tx
          .select({ id: s.incidentReports.id })
          .from(s.incidentReports)
          .where(eq(s.incidentReports.laboratoryId, labId))
      ).map((i) => i.id);
      if (incidents.length) {
        await tx
          .delete(s.incidentEvents)
          .where(inArray(s.incidentEvents.incidentId, incidents));
        await tx
          .delete(s.incidentReports)
          .where(inArray(s.incidentReports.id, incidents));
      }
      const spaceIds = (
        await tx
          .select({ id: s.spaces.id })
          .from(s.spaces)
          .where(eq(s.spaces.laboratoryId, labId))
      ).map((r) => r.id);
      if (spaceIds.length) {
        const reservationIds = (
          await tx
            .select({ id: s.reservations.id })
            .from(s.reservations)
            .where(inArray(s.reservations.spaceId, spaceIds))
        ).map((r) => r.id);
        if (reservationIds.length) {
          await tx
            .delete(s.reservationResources)
            .where(
              inArray(s.reservationResources.reservationId, reservationIds),
            );
          await tx
            .delete(s.reservations)
            .where(inArray(s.reservations.id, reservationIds));
        }
        await tx
          .delete(s.resources)
          .where(inArray(s.resources.spaceId, spaceIds));
        await tx
          .delete(s.locations)
          .where(inArray(s.locations.spaceId, spaceIds));
        await tx.delete(s.spaces).where(inArray(s.spaces.id, spaceIds));
      }
      const memberships = await tx
        .select({ id: s.laboratoryMemberships.id })
        .from(s.laboratoryMemberships)
        .where(eq(s.laboratoryMemberships.laboratoryId, labId));
      if (memberships.length)
        await tx.delete(s.membershipRoles).where(
          inArray(
            s.membershipRoles.membershipId,
            memberships.map((m) => m.id),
          ),
        );
      await tx
        .delete(s.laboratoryMemberships)
        .where(eq(s.laboratoryMemberships.laboratoryId, labId));
      if (roleIds.length) {
        await tx
          .delete(s.rolePermissions)
          .where(inArray(s.rolePermissions.roleId, roleIds));
        await tx.delete(s.roles).where(inArray(s.roles.id, roleIds));
      }
      await tx.delete(s.laboratories).where(eq(s.laboratories.id, labId));
      if (userIds.length) {
        await tx.delete(s.sessions).where(inArray(s.sessions.userId, userIds));
        await tx.delete(s.accounts).where(inArray(s.accounts.userId, userIds));
        await tx.delete(s.users).where(inArray(s.users.id, userIds));
      }
    });
  } finally {
    await pool.end();
  }
}
