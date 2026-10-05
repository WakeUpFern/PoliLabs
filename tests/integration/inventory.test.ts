import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../../src/infrastructure/database/schema";
import { users } from "../../src/modules/identity/infrastructure/auth-schema";
import {
  laboratories,
  laboratoryMemberships,
  membershipRoles,
  roles,
  rolePermissions,
  permissions,
} from "../../src/modules/identity/infrastructure/access-schema";
import { INITIAL_PERMISSION_LIST } from "../../src/modules/identity/domain/access-catalog";
import {
  AuthorizationDeniedError,
  AuthenticationRequiredError,
} from "../../src/modules/identity/domain/access-errors";
import {
  spaces,
  locations,
} from "../../src/modules/spatial/infrastructure/spatial-schema";
import {
  inventoryItems,
  inventoryStocks,
  inventoryMovements,
  inventoryEvents,
} from "../../src/modules/inventory/infrastructure/inventory-schema";
import { DrizzleInventoryStore } from "../../src/modules/inventory/infrastructure/inventory-store";
import {
  CreateInventoryItem,
  GetInventoryItem,
  ListInventory,
  RecordInventoryMovement,
  UpdateInventoryItem,
  DeactivateInventoryItem,
} from "../../src/modules/inventory/application/inventory";
import { InventoryError } from "../../src/modules/inventory/domain/inventory";
import { InventoryWeb } from "../../src/modules/inventory/web/inventory-web";
import { AuthorizationService } from "../../src/modules/identity/application/authorization-service";
import {
  DrizzleAuthorizationReader,
  DrizzleLaboratoryReader,
} from "../../src/modules/identity/infrastructure/access-repository";
import { GetLaboratoryBySlug } from "../../src/modules/identity/application/get-laboratory-by-slug";
import { ListSpaces } from "../../src/modules/spatial/application/list-spaces";
import { ListLocations } from "../../src/modules/spatial/application/list-locations";
import { DrizzleSpaceRepository } from "../../src/modules/spatial/infrastructure/space-repository";
import { DrizzleSpatialOrganizationRepository } from "../../src/modules/spatial/infrastructure/spatial-organization-repository";
import { DeactivateLocation } from "../../src/modules/spatial/application/manage-locations";
import { DeactivateSpace } from "../../src/modules/spatial/application/manage-spaces";
import { LocationHasActiveDependentsError } from "../../src/modules/spatial/domain/location";
import { SpaceHasInventoryStockError } from "../../src/modules/spatial/domain/space";
import { prepareIntegrationDatabase } from "./database";
function code(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return;
  if ("code" in error) return String(error.code);
  if ("cause" in error) return code(error.cause);
}
const rejected = (expected: string) => (error: unknown) =>
  error instanceof InventoryError && error.code === expected;
test("Inventory I application, web adapter and PostgreSQL invariants", async (context) => {
  const pool = new Pool({
    connectionString: await prepareIntegrationDatabase(),
    max: 10,
  });
  const db = drizzle(pool, { schema });
  const suffix = randomUUID();
  const actorIds = [randomUUID(), randomUUID()];
  const labIds = [randomUUID(), randomUUID()];
  const roleIds = [randomUUID(), randomUUID()];
  const spaceIds = [randomUUID(), randomUUID()];
  const locationIds = [randomUUID(), randomUUID(), randomUUID()];
  const actor = { actorUserId: actorIds[0], laboratoryId: labIds[0] };
  const source = "WEB";
  try {
    await db.insert(users).values(
      actorIds.map((id, i) => ({
        id,
        name: `Inventory fixture ${i}`,
        email: `inventory-${suffix}-${i}@invalid.test`,
      })),
    );
    await db.insert(laboratories).values(
      labIds.map((id, i) => ({
        id,
        name: `Inventory lab ${i}`,
        slug: `inventory-${suffix}-${i}`,
      })),
    );
    await db.insert(roles).values(
      roleIds.map((id, i) => ({
        id,
        key: `inventory-${suffix}-${i}`,
        name: "Inventory fixture",
        description: "Synthetic data",
      })),
    );
    await db
      .insert(permissions)
      .values(INITIAL_PERMISSION_LIST)
      .onConflictDoNothing();
    const catalog = await db.select().from(permissions);
    await db
      .insert(rolePermissions)
      .values(
        roleIds.flatMap((roleId, i) =>
          catalog
            .filter(
              (p) =>
                i === 0 ||
                ["laboratory.read", "inventory.read"].includes(p.key),
            )
            .map((p) => ({ roleId, permissionId: p.id })),
        ),
      );
    const memberships = await db
      .insert(laboratoryMemberships)
      .values([
        { userId: actorIds[0], laboratoryId: labIds[0] },
        { userId: actorIds[1], laboratoryId: labIds[0] },
        { userId: actorIds[0], laboratoryId: labIds[1] },
      ])
      .returning();
    await db.insert(membershipRoles).values(
      memberships.map((m, i) => ({
        membershipId: m.id,
        roleId: roleIds[i === 0 ? 0 : 1],
      })),
    );
    await db.insert(spaces).values(
      spaceIds.map((id, i) => ({
        id,
        laboratoryId: labIds[i],
        name: `Space ${i}`,
        slug: `space-${i}`,
      })),
    );
    await db.insert(locations).values([
      { id: locationIds[0], spaceId: spaceIds[0], name: "Shelf" },
      {
        id: locationIds[1],
        spaceId: spaceIds[0],
        parentId: locationIds[0],
        name: "Box",
      },
      { id: locationIds[2], spaceId: spaceIds[1], name: "Other lab" },
    ]);
    const store = new DrizzleInventoryStore(db);
    const create = new CreateInventoryItem(store),
      get = new GetInventoryItem(store),
      list = new ListInventory(store),
      record = new RecordInventoryMovement(store),
      update = new UpdateInventoryItem(store),
      deactivate = new DeactivateInventoryItem(store);
    const authorization = new AuthorizationService(
      new DrizzleAuthorizationReader(db),
    );
    const spatial = new DrizzleSpatialOrganizationRepository(db),
      spaceRepo = new DrizzleSpaceRepository(db);
    let sessionActor: string | null = actorIds[0];
    const web = new InventoryWeb({
      currentActor: async () => {
        if (!sessionActor) throw new AuthenticationRequiredError();
        return { actorUserId: sessionActor };
      },
      laboratory: new GetLaboratoryBySlug(
        authorization,
        new DrizzleLaboratoryReader(db),
      ),
      authorization,
      spaces: new ListSpaces(authorization, spaceRepo),
      locations: new ListLocations(authorization, spatial),
      list,
      get,
      create,
      update,
      deactivate,
      record,
    });
    const slug = `inventory-${suffix}-0`;
    const base = {
      ...actor,
      name: "Oil",
      type: "consumable",
      unit: "litre",
      source,
      notes: "Initial count",
    };
    let oilId = "",
      toolId = "";
    await context.test(
      "creation without location, zero stock and initial movement are atomic",
      async () => {
        const oil = await create.execute({ ...base, initialQuantity: "1.100" });
        oilId = oil.id;
        assert.equal(oil.quantity, "1.100");
        assert.equal(oil.locationId, null);
        const detail = await get.execute({ ...actor, itemId: oilId });
        assert.equal(detail.movements.length, 1);
        assert.equal(detail.movements[0].quantityBefore, "0.000");
        assert.equal(detail.movements[0].quantityAfter, "1.100");
        const empty = await create.execute({ ...base, name: "Empty" });
        assert.equal(empty.quantity, "0.000");
        assert.deepEqual(
          (await get.execute({ ...actor, itemId: empty.id })).movements,
          [],
        );
        const previous = (await list.execute(actor)).length;
        await assert.rejects(
          create.execute({
            ...base,
            name: "Invalid",
            initialQuantity: "2",
            locationId: locationIds[2],
          }),
          rejected("location"),
        );
        assert.equal((await list.execute(actor)).length, previous);
        // An error after item insertion must roll back catalog and audit too.
        await assert.rejects(
          store.run(actor, ["inventory.manage"], async (session) => {
            await session.create(
              actor,
              {
                name: "Rolled back",
                type: "consumable",
                unit: "litre",
                locationId: null,
              },
              "WEB",
            );
            throw new Error("rollback");
          }),
          /rollback/,
        );
        assert.equal(
          (await list.execute({ ...actor, search: "Rolled back" })).length,
          0,
        );
      },
    );
    await context.test(
      "exact decimal movements, audit origin and immutable type/unit",
      async () => {
        await record.execute({
          ...actor,
          itemId: oilId,
          type: "purchase",
          quantity: "0.200",
          notes: "Synthetic purchase",
          source: "API",
        });
        await record.execute({
          ...actor,
          itemId: oilId,
          type: "consumption",
          quantity: "0.300",
          notes: "Synthetic operation",
          source,
        });
        assert.equal(
          (await get.execute({ ...actor, itemId: oilId })).item.quantity,
          "1.000",
        );
        await update.execute({
          ...base,
          itemId: oilId,
          name: "Hydraulic oil",
          locationId: locationIds[1],
        });
        const detail = await get.execute({ ...actor, itemId: oilId });
        assert.equal(detail.item.locationId, locationIds[1]);
        assert.ok(detail.movements.every((m) => m.locationId === null));
        assert.ok(
          detail.movements.some(
            (m) => m.source === "API" && m.actorUserId === actorIds[0],
          ),
        );
        await assert.rejects(
          update.execute({ ...base, itemId: oilId, unit: "kilogram" }),
          rejected("immutable-unit"),
        );
        assert.equal(
          (
            await db
              .select()
              .from(inventoryEvents)
              .where(eq(inventoryEvents.itemId, oilId))
          ).length,
          2,
        );
      },
    );
    await context.test(
      "tools reject consumption, returns, fractional pieces and insufficient stock",
      async () => {
        const tool = await create.execute({
          ...base,
          name: "Screwdriver",
          type: "reusable_tool",
          unit: "piece",
          initialQuantity: "10",
        });
        toolId = tool.id;
        for (const [type, quantity, error] of [
          ["consumption", "1", "tool-consumption"],
          ["return", "1", "input"],
          ["entry", "0.5", "input"],
          ["loss", "11", "insufficient-stock"],
        ])
          await assert.rejects(
            record.execute({
              ...actor,
              itemId: toolId,
              type,
              quantity,
              notes: "Fixture",
              source,
            }),
            rejected(error),
          );
        assert.equal(
          (await get.execute({ ...actor, itemId: toolId })).item.quantity,
          "10.000",
        );
      },
    );
    await context.test(
      "simultaneous exits cannot oversell; balance and ledger agree",
      async () => {
        const item = await create.execute({
          ...base,
          name: "Concurrent",
          initialQuantity: "1",
        });
        const results = await Promise.allSettled(
          [1, 2].map(() =>
            record.execute({
              ...actor,
              itemId: item.id,
              type: "consumption",
              quantity: "0.700",
              notes: "Concurrent operation",
              source,
            }),
          ),
        );
        assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
        const failure = results.find((r) => r.status === "rejected");
        assert.ok(
          failure?.status === "rejected" &&
            rejected("insufficient-stock")(failure.reason),
        );
        const detail = await get.execute({ ...actor, itemId: item.id });
        assert.equal(detail.item.quantity, "0.300");
        assert.equal(detail.movements.length, 2);
        await Promise.all(
          [1, 2].map(() =>
            record.execute({
              ...actor,
              itemId: item.id,
              type: "entry",
              quantity: "0.100",
              notes: "Concurrent entry",
              source,
            }),
          ),
        );
        assert.equal(
          (await get.execute({ ...actor, itemId: item.id })).item.quantity,
          "0.500",
        );
      },
    );
    await context.test(
      "permission isolation, cross-lab identifiers and revoked membership",
      async () => {
        const reader = { ...actor, actorUserId: actorIds[1] };
        assert.ok((await list.execute(reader)).length);
        await assert.rejects(
          record.execute({
            ...reader,
            itemId: oilId,
            type: "entry",
            quantity: "1",
            notes: "Denied",
            source,
          }),
          AuthorizationDeniedError,
        );
        await assert.rejects(
          create.execute({ ...base, actorUserId: actorIds[1] }),
          AuthorizationDeniedError,
        );
        await assert.rejects(
          get.execute({ ...actor, laboratoryId: labIds[1], itemId: oilId }),
          rejected("not-found"),
        );
        assert.deepEqual(
          await list.execute({ ...actor, laboratoryId: labIds[1] }),
          [],
        );
        await assert.rejects(
          update.execute({
            ...base,
            itemId: oilId,
            locationId: locationIds[2],
          }),
          rejected("location"),
        );
        await db
          .update(laboratoryMemberships)
          .set({ isActive: false })
          .where(eq(laboratoryMemberships.id, memberships[0].id));
        await assert.rejects(
          record.execute({
            ...actor,
            itemId: oilId,
            type: "entry",
            quantity: "1",
            notes: "Revoked",
            source,
          }),
          AuthorizationDeniedError,
        );
        await db
          .update(laboratoryMemberships)
          .set({ isActive: true })
          .where(eq(laboratoryMemberships.id, memberships[0].id));
      },
    );
    await context.test(
      "PostgreSQL prevents silent stock changes and history edits/deletions",
      async () => {
        for (const operation of [
          () =>
            db
              .update(inventoryStocks)
              .set({ quantity: "999" })
              .where(eq(inventoryStocks.itemId, oilId)),
          () =>
            db
              .update(inventoryMovements)
              .set({ notes: "Changed" })
              .where(eq(inventoryMovements.itemId, oilId)),
          () =>
            db
              .delete(inventoryMovements)
              .where(eq(inventoryMovements.itemId, oilId)),
          () =>
            db
              .update(inventoryItems)
              .set({ unit: "kilogram" })
              .where(eq(inventoryItems.id, oilId)),
          () => db.insert(inventoryStocks).values({ itemId: oilId }),
        ])
          await assert.rejects(operation(), (error) =>
            ["23514", "23505"].includes(code(error) ?? ""),
          );
        assert.equal(
          (await get.execute({ ...actor, itemId: oilId })).item.quantity,
          "1.000",
        );
        await assert.rejects(
          db.insert(inventoryMovements).values({
            itemId: toolId,
            laboratoryId: labIds[0],
            type: "consumption",
            quantity: "1",
            quantityBefore: "0",
            quantityAfter: "0",
            actorUserId: actorIds[0],
            source,
            notes: "Bypass",
          }),
          (error) => code(error) === "23514",
        );
        await assert.rejects(
          db
            .update(inventoryStocks)
            .set({ locationId: locationIds[2] })
            .where(eq(inventoryStocks.itemId, oilId)),
          (error) => code(error) === "23503",
        );
      },
    );
    await context.test(
      "Spatial cannot deactivate a stock-bearing location or space",
      async () => {
        await assert.rejects(
          new DeactivateLocation(authorization, spatial).execute({
            ...actor,
            spaceId: spaceIds[0],
            locationId: locationIds[1],
          }),
          LocationHasActiveDependentsError,
        );
        await assert.rejects(
          new DeactivateSpace(authorization, spaceRepo).execute({
            ...actor,
            slug: "space-0",
          }),
          SpaceHasInventoryStockError,
        );
      },
    );
    await context.test(
      "web form flow: search, hierarchical location, create, movement, edit, deactivate and history",
      async () => {
        const form = new FormData();
        form.set("name", "Web material");
        form.set("type", "consumable");
        form.set("unit", "metre");
        form.set("initialQuantity", "2.500");
        form.set("notes", "Initial web count");
        form.set("locationId", locationIds[1]);
        const options = await web.newForm(slug);
        assert.ok(
          options.locations.some((o) => o.label === "Space 0 > Shelf > Box"),
        );
        const created = await web.submit(slug, "create", null, form);
        assert.equal(
          (await web.list(slug, { search: "web material", type: "consumable" }))
            .items.length,
          1,
        );
        assert.equal(
          (await web.detail(slug, created.itemId)).item.quantity,
          "2.500",
        );
        form.set("type", "consumption");
        form.set("quantity", "2.500");
        form.set("notes", "Real fixture operation");
        await web.submit(slug, "movement", created.itemId, form);
        form.set("name", "Web material edited");
        form.set("type", "consumable");
        await web.submit(slug, "update", created.itemId, form);
        await web.submit(slug, "deactivate", created.itemId, new FormData());
        assert.equal(
          (await web.detail(slug, created.itemId)).item.isActive,
          false,
        );
        assert.equal(
          (await web.detail(slug, created.itemId)).movements.length,
          2,
        );
        assert.equal(
          (await web.list(slug, { search: "web material" })).items.length,
          0,
        );
        assert.equal(
          (
            await web.list(slug, {
              search: "web material",
              includeInactive: true,
            })
          ).items.length,
          1,
        );
        await assert.rejects(
          web.submit(slug, "movement", created.itemId, form),
          rejected("inactive"),
        );
        sessionActor = null;
        await assert.rejects(web.list(slug), AuthenticationRequiredError);
        await assert.rejects(
          web.submit(slug, "create", null, form),
          AuthenticationRequiredError,
        );
        sessionActor = actorIds[1];
        assert.equal((await web.list(slug)).canManage, false);
        await assert.rejects(
          web.submit(slug, "deactivate", oilId, form),
          AuthorizationDeniedError,
        );
        sessionActor = actorIds[0];
      },
    );
    await context.test(
      "deactivation requires zero and retains history",
      async () => {
        await assert.rejects(
          deactivate.execute({ ...actor, itemId: oilId, source }),
          rejected("has-stock"),
        );
        await record.execute({
          ...actor,
          itemId: oilId,
          type: "adjustment_out",
          quantity: "1",
          notes: "Fixture count correction",
          source,
        });
        await deactivate.execute({ ...actor, itemId: oilId, source });
        await deactivate.execute({ ...actor, itemId: oilId, source });
        const detail = await get.execute({ ...actor, itemId: oilId });
        assert.equal(detail.item.isActive, false);
        assert.equal(detail.movements.length, 4);
      },
    );
    await context.test("no SQL NaN balance is accepted", async () => {
      await assert.rejects(
        db.execute(
          sql`update inventory_stocks set quantity = 'NaN'::numeric where item_id = ${toolId}`,
        ),
        (error) => code(error) === "23514",
      );
    });
  } finally {
    // Delete only synthetic fixtures in the isolated *_test database, in one transaction.
    await db.transaction(async (tx) => {
      const rows = await tx
        .select({ id: inventoryItems.id })
        .from(inventoryItems)
        .where(inArray(inventoryItems.laboratoryId, labIds));
      if (rows.length) {
        const ids = rows.map((row) => row.id);
        await tx
          .delete(inventoryEvents)
          .where(inArray(inventoryEvents.itemId, ids));
        await tx
          .delete(inventoryMovements)
          .where(inArray(inventoryMovements.itemId, ids));
        await tx
          .delete(inventoryStocks)
          .where(inArray(inventoryStocks.itemId, ids));
        await tx.delete(inventoryItems).where(inArray(inventoryItems.id, ids));
      }
      await tx.delete(locations).where(eq(locations.id, locationIds[1]));
      await tx
        .delete(locations)
        .where(inArray(locations.id, [locationIds[0], locationIds[2]]));
      await tx.delete(spaces).where(inArray(spaces.id, spaceIds));
      const memberships = await tx
        .select()
        .from(laboratoryMemberships)
        .where(inArray(laboratoryMemberships.userId, actorIds));
      if (memberships.length)
        await tx.delete(membershipRoles).where(
          inArray(
            membershipRoles.membershipId,
            memberships.map((m) => m.id),
          ),
        );
      await tx
        .delete(laboratoryMemberships)
        .where(inArray(laboratoryMemberships.userId, actorIds));
      await tx
        .delete(rolePermissions)
        .where(inArray(rolePermissions.roleId, roleIds));
      await tx.delete(roles).where(inArray(roles.id, roleIds));
      await tx.delete(laboratories).where(inArray(laboratories.id, labIds));
      await tx.delete(users).where(inArray(users.id, actorIds));
    });
    await pool.end();
  }
});
