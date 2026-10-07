import { test } from "node:test";
import assert from "node:assert/strict";
import { MaintenanceService } from "../../src/modules/maintenance/application/maintenance";
import { DrizzleMaintenanceStore } from "../../src/modules/maintenance/infrastructure/maintenance-store";
import { MaintenanceError } from "../../src/modules/maintenance/domain/maintenance";
import { CreateInventoryItem } from "../../src/modules/inventory/application/inventory";
import { DrizzleInventoryStore } from "../../src/modules/inventory/infrastructure/inventory-store";
import {
  CreateReservation,
  CancelReservation,
} from "../../src/modules/reservations/application/reservations";
import { DrizzleReservationStore } from "../../src/modules/reservations/infrastructure/reservation-store";
import { ReservationTargetError } from "../../src/modules/reservations/domain/reservation";
import { UsageService } from "../../src/modules/usage/application/usage";
import { DrizzleUsageStore } from "../../src/modules/usage/infrastructure/usage-store";
import { IncidentService } from "../../src/modules/incidents/application/incidents";
import { DrizzleIncidentStore } from "../../src/modules/incidents/infrastructure/incident-store";
import { AuthorizationDeniedError } from "../../src/modules/identity/domain/access-errors";
import {
  operationFixture,
  pgCode,
  and,
  eq,
  inArray,
} from "./operation-fixture";

const rejected = (code: string) => (error: unknown) =>
  error instanceof MaintenanceError && error.code === code;

test("Maintenance I logs, operational status, materials and RB5 in PostgreSQL", async (t) => {
  const f = await operationFixture();
  const { db, schema, pool, actor, student, spaceRows, resourceRows } = f;
  const service = new MaintenanceService(new DrizzleMaintenanceStore(db));
  const inventory = new CreateInventoryItem(new DrizzleInventoryStore(db));
  const reservations = new CreateReservation(new DrizzleReservationStore(db)),
    cancel = new CancelReservation(new DrizzleReservationStore(db));
  const usage = new UsageService(new DrizzleUsageStore(db));
  const incidents = new IncidentService(new DrizzleIncidentStore(db));
  const minutesAgo = (minutes: number) =>
    new Date(Date.now() - minutes * 60000).toISOString();
  const record = (overrides: Record<string, unknown> = {}) =>
    service.record({
      ...actor,
      resourceId: resourceRows[0].id,
      type: "preventive",
      description: "Lubricación general",
      statusAfter: "operational",
      performedAt: minutesAgo(30),
      ...overrides,
    });
  const status = async (id: string) =>
    (
      await db
        .select({ value: schema.resources.operationalStatus })
        .from(schema.resources)
        .where(eq(schema.resources.id, id))
    )[0].value;
  const consumable = (quantity: string, laboratoryId = actor.laboratoryId) =>
    inventory.execute({
      ...actor,
      laboratoryId,
      name: "Aceite",
      type: "consumable",
      unit: "litre",
      initialQuantity: quantity,
      notes: "Existencia sintética",
    });
  const stock = async (itemId: string) =>
    (
      await db
        .select({ quantity: schema.inventoryStocks.quantity })
        .from(schema.inventoryStocks)
        .where(eq(schema.inventoryStocks.itemId, itemId))
    )[0].quantity;
  const reserve = (resourceIds: string[], isExclusive = false, offset = 0) =>
    reservations.execute({
      ...student,
      spaceId: spaceRows[1].id,
      resourceIds,
      isExclusive,
      startsAt: new Date(Date.now() + 3600000 + offset).toISOString(),
      endsAt: new Date(Date.now() + 7200000 + offset).toISOString(),
    });
  try {
    await t.test(
      "a log applies the resulting status and records the previous one",
      async () => {
        const first = await record({
          type: "corrective",
          statusAfter: "in_maintenance",
          nextDueOn: "2027-01-15",
        });
        assert.equal(first.statusBefore, "operational");
        assert.equal(first.statusAfter, "in_maintenance");
        assert.equal(first.performedBy, actor.actorUserId);
        assert.equal(first.performerName, "Operational 0");
        assert.equal(first.source, "WEB");
        assert.equal(first.nextDueOn, "2027-01-15");
        assert.equal(await status(resourceRows[0].id), "in_maintenance");
        const second = await record({ performedAt: minutesAgo(5) });
        assert.equal(second.statusBefore, "in_maintenance");
        assert.equal(await status(resourceRows[0].id), "operational");
        const detail = await service.detail({
          ...actor,
          resourceId: resourceRows[0].id,
        });
        assert.deepEqual(
          detail.logs.map((l) => l.id),
          [second.id, first.id],
        );
        const listed = (await service.resources(actor)).find(
          (r) => r.id === resourceRows[0].id,
        );
        assert.equal(listed?.operationalStatus, "operational");
        assert.equal(
          listed?.lastPerformedAt?.toISOString(),
          second.performedAt.toISOString(),
        );
      },
    );
    await t.test(
      "status changes only through a log and history is immutable",
      async () => {
        await assert.rejects(
          db
            .update(schema.resources)
            .set({ operationalStatus: "out_of_service" })
            .where(eq(schema.resources.id, resourceRows[0].id)),
          (e) => pgCode(e) === "23514",
        );
        await assert.rejects(
          db.insert(schema.resources).values({
            spaceId: spaceRows[0].id,
            name: "Broken on arrival",
            operationalStatus: "out_of_service",
          }),
          (e) => pgCode(e) === "23514",
        );
        // Spatial edits that do not touch the status keep working.
        await db
          .update(schema.resources)
          .set({ name: "Machine" })
          .where(eq(schema.resources.id, resourceRows[0].id));
        await assert.rejects(
          db
            .update(schema.maintenanceLogs)
            .set({ description: "Reescrito" })
            .where(eq(schema.maintenanceLogs.resourceId, resourceRows[0].id)),
          (e) => pgCode(e) === "23514",
        );
      },
    );
    await t.test("permissions and laboratory scope are enforced", async () => {
      await assert.rejects(
        service.resources(student),
        AuthorizationDeniedError,
      );
      await assert.rejects(record({ ...student }), AuthorizationDeniedError);
      await assert.rejects(
        record({ resourceId: resourceRows[2].id }),
        rejected("not-found"),
      );
      await assert.rejects(
        service.detail({ ...actor, resourceId: resourceRows[2].id }),
        rejected("not-found"),
      );
      await assert.rejects(
        async () =>
          record({ performedAt: new Date(Date.now() + 60000).toISOString() }),
        rejected("input"),
      );
      const [inactive] = await db
        .insert(schema.resources)
        .values({ spaceId: spaceRows[0].id, name: "Retired" })
        .returning();
      try {
        await db
          .update(schema.resources)
          .set({ isActive: false })
          .where(eq(schema.resources.id, inactive.id));
        await assert.rejects(
          record({ resourceId: inactive.id }),
          rejected("not-found"),
        );
      } finally {
        await db
          .delete(schema.resources)
          .where(eq(schema.resources.id, inactive.id));
      }
    });
    await t.test(
      "materials consume inventory in the same transaction as the log",
      async () => {
        const oil = await consumable("5");
        const log = await record({
          materials: [{ itemId: oil.id, quantity: "1.5" }],
        });
        assert.equal(log.materials.length, 1);
        assert.equal(log.materials[0].itemId, oil.id);
        assert.equal(log.materials[0].quantity, "1.500");
        assert.equal(await stock(oil.id), "3.500");
        const [movement] = await db
          .select()
          .from(schema.inventoryMovements)
          .where(eq(schema.inventoryMovements.id, log.materials[0].movementId));
        assert.equal(movement.type, "consumption");
        assert.equal(movement.actorUserId, actor.actorUserId);
        const before = (
          await service.detail({ ...actor, resourceId: resourceRows[0].id })
        ).logs.length;
        await assert.rejects(
          record({
            statusAfter: "out_of_service",
            materials: [{ itemId: oil.id, quantity: "10" }],
          }),
          rejected("insufficient-stock"),
        );
        assert.equal(await stock(oil.id), "3.500");
        assert.equal(await status(resourceRows[0].id), "operational");
        assert.equal(
          (await service.detail({ ...actor, resourceId: resourceRows[0].id }))
            .logs.length,
          before,
        );
        const tool = await inventory.execute({
          ...actor,
          name: "Pinzas",
          type: "reusable_tool",
          unit: "piece",
          initialQuantity: "2",
          notes: "Existencia sintética",
        });
        await assert.rejects(
          record({ materials: [{ itemId: tool.id, quantity: "1" }] }),
          rejected("material"),
        );
        const foreign = await consumable("5", f.labIds[1]);
        await assert.rejects(
          record({ materials: [{ itemId: foreign.id, quantity: "1" }] }),
          rejected("material"),
        );
        assert.equal(await stock(foreign.id), "5.000");
      },
    );
    await t.test(
      "materials additionally require inventory.adjust",
      async () => {
        const granted = await db
          .select()
          .from(schema.permissions)
          .where(
            inArray(schema.permissions.key, [
              "maintenance.read",
              "maintenance.create",
            ]),
          );
        await db
          .insert(schema.rolePermissions)
          .values(
            granted.map((p) => ({ roleId: f.roleIds[1], permissionId: p.id })),
          );
        try {
          const oil = await consumable("2");
          await assert.rejects(
            record({
              ...student,
              materials: [{ itemId: oil.id, quantity: "1" }],
            }),
            AuthorizationDeniedError,
          );
          assert.equal(await stock(oil.id), "2.000");
          const log = await record({ ...student });
          assert.equal(log.performedBy, student.actorUserId);
          const options = await service.options({
            ...student,
            resourceId: resourceRows[0].id,
          });
          assert.equal(options.items.length, 0);
        } finally {
          await db.delete(schema.rolePermissions).where(
            and(
              eq(schema.rolePermissions.roleId, f.roleIds[1]),
              inArray(
                schema.rolePermissions.permissionId,
                granted.map((p) => p.id),
              ),
            ),
          );
        }
      },
    );
    await t.test(
      "incident links must target the same resource and do not change the incident",
      async () => {
        const incident = await incidents.report({
          ...student,
          targetKind: "resource",
          targetId: resourceRows[0].id,
          description: "Ruido anormal",
          severity: "medium",
        });
        const log = await record({
          type: "corrective",
          incidentId: incident.id,
        });
        assert.equal(log.incidentId, incident.id);
        const options = await service.options({
          ...actor,
          resourceId: resourceRows[0].id,
        });
        assert.ok(options.incidents.some((i) => i.id === incident.id));
        const after = await incidents.detail({
          ...actor,
          incidentId: incident.id,
          scope: "laboratory",
        });
        assert.equal(after.incident.status, "open");
        const spaceIncident = await incidents.report({
          ...student,
          targetKind: "space",
          targetId: spaceRows[0].id,
          description: "Iluminación",
          severity: "low",
        });
        await assert.rejects(
          record({ incidentId: spaceIncident.id }),
          rejected("relation"),
        );
        await assert.rejects(
          record({ resourceId: resourceRows[1].id, incidentId: incident.id }),
          rejected("relation"),
        );
      },
    );
    await t.test(
      "RB5: non-operational resources reject new reservations, keep existing ones",
      async () => {
        const existing = await reserve([resourceRows[1].id]);
        await record({
          resourceId: resourceRows[1].id,
          type: "inspection",
          statusAfter: "out_of_service",
        });
        const detail = await service.detail({
          ...actor,
          resourceId: resourceRows[1].id,
        });
        assert.equal(detail.impact.futureReservations, 1);
        const [kept] = await db
          .select()
          .from(schema.reservations)
          .where(eq(schema.reservations.id, existing.id));
        assert.equal(kept.status, "confirmed");
        await assert.rejects(
          reserve([resourceRows[1].id], false, 7200000),
          ReservationTargetError,
        );
        // The space itself remains reservable.
        const exclusive = await reserve([], true, 7200000);
        await cancel.execute({ ...student, reservationId: exclusive.id });
        await cancel.execute({ ...student, reservationId: existing.id });
        await record({ resourceId: resourceRows[1].id });
        const again = await reserve([resourceRows[1].id], false, 14400000);
        await cancel.execute({ ...student, reservationId: again.id });
      },
    );
    await t.test(
      "RB5: usage cannot start on non-operational resources; open usage stays open",
      async () => {
        const session = await f.session();
        await f.academic.changeSessionStatus({
          ...actor,
          sessionId: session.id,
          status: "open",
        });
        const start = {
          ...student,
          kind: "academic",
          contextId: session.id,
          resourceId: resourceRows[0].id,
        };
        const open = await usage.start(start);
        await record({ statusAfter: "out_of_service" });
        const detail = await service.detail({
          ...actor,
          resourceId: resourceRows[0].id,
        });
        assert.equal(detail.impact.openUsages, 1);
        const [still] = await db
          .select()
          .from(schema.resourceUsage)
          .where(eq(schema.resourceUsage.id, open.id));
        assert.equal(still.endedAt, null);
        await usage.finish({ ...student, usageId: open.id });
        assert.ok(
          !(await usage.options(student)).some(
            (o) => o.resourceId === resourceRows[0].id,
          ),
        );
        await assert.rejects(
          usage.start(start),
          (e: unknown) =>
            e instanceof Error && "code" in e && e.code === "unavailable",
        );
        await record();
        const resumed = await usage.start(start);
        await usage.finish({ ...student, usageId: resumed.id });
      },
    );
    await t.test(
      "a status change committed during reservation validation rejects the reservation",
      async () => {
        const client = await pool.connect();
        try {
          await client.query("begin isolation level read committed");
          await client.query(
            `insert into maintenance_logs (laboratory_id, space_id, resource_id, performed_by, maintenance_type, description, status_before, status_after, performed_at, source)
             values ($1, $2, $3, $4, 'corrective', 'Falla', 'operational', 'out_of_service', now(), 'SYSTEM')`,
            [
              actor.laboratoryId,
              spaceRows[1].id,
              resourceRows[1].id,
              actor.actorUserId,
            ],
          );
          const pending = reserve([resourceRows[1].id], false, 21600000);
          const outcome = pending.then(
            () => "created",
            (e: unknown) => e,
          );
          await new Promise((resolve) => setTimeout(resolve, 300));
          await client.query("commit");
          assert.ok((await outcome) instanceof ReservationTargetError);
        } finally {
          client.release();
        }
        await record({ resourceId: resourceRows[1].id });
      },
    );
    await t.test("concurrent consumptions cannot overdraw stock", async () => {
      const oil = await consumable("5");
      const results = await Promise.allSettled([
        record({ materials: [{ itemId: oil.id, quantity: "3" }] }),
        record({ materials: [{ itemId: oil.id, quantity: "3" }] }),
      ]);
      assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
      const failure = results.find((r) => r.status === "rejected");
      assert.ok(
        failure?.status === "rejected" &&
          rejected("insufficient-stock")(failure.reason),
      );
      assert.equal(await stock(oil.id), "2.000");
    });
  } finally {
    await f.cleanup();
  }
});
