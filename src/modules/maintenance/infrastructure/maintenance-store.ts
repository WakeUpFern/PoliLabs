import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  sql,
} from "drizzle-orm";
import {
  authorizeLocked,
  type OperationDatabase,
  type OperationTransaction,
} from "@/modules/identity/infrastructure/authorize-locked";
import type { PermissionKey } from "@/modules/identity/domain/access-catalog";
import { users } from "@/modules/identity/infrastructure/auth-schema";
import {
  spaces,
  resources,
} from "@/modules/spatial/infrastructure/spatial-schema";
import { incidentReports } from "@/modules/incidents/infrastructure/incident-schema";
import {
  inventoryItems,
  inventoryStocks,
  inventoryMovements,
} from "@/modules/inventory/infrastructure/inventory-schema";
import {
  balanceAfter,
  InventoryError,
  quantityInThousandths,
} from "@/modules/inventory/domain/inventory";
import { resourceUsage } from "@/modules/usage/infrastructure/usage-schema";
import {
  reservations,
  reservationResources,
} from "@/modules/reservations/infrastructure/reservation-schema";
import { maintenanceLogs, maintenanceMaterials } from "./maintenance-schema";
import {
  MaintenanceError,
  maintenanceId,
  type MaintenanceContext,
  type MaintenanceLog,
  type MaintenanceRecord,
  type MaintenanceResource,
} from "../domain/maintenance";
import type {
  MaintenanceStore,
  MaintenanceTransaction,
} from "../application/maintenance-store";
function postgresError(error: unknown): { code?: string; message?: string } {
  if (!error || typeof error !== "object") return {};
  if ("code" in error) return error as { code: string; message?: string };
  if ("cause" in error) return postgresError(error.cause);
  return {};
}
const resourceColumns = {
  id: resources.id,
  name: resources.name,
  spaceId: resources.spaceId,
  spaceName: spaces.name,
  operationalStatus: resources.operationalStatus,
};
class DrizzleMaintenanceTransaction implements MaintenanceTransaction {
  constructor(
    private readonly tx: OperationTransaction,
    private readonly context: MaintenanceContext,
  ) {}
  private async latest(resourceIds: string[]) {
    type Latest = {
      resourceId: string;
      performedAt: Date;
      nextDueOn: string | null;
    };
    if (!resourceIds.length) return new Map<string, Latest>();
    const rows: Latest[] = await this.tx
      .selectDistinctOn([maintenanceLogs.resourceId], {
        resourceId: maintenanceLogs.resourceId,
        performedAt: maintenanceLogs.performedAt,
        nextDueOn: maintenanceLogs.nextDueOn,
      })
      .from(maintenanceLogs)
      .where(
        and(
          eq(maintenanceLogs.laboratoryId, this.context.laboratoryId),
          inArray(maintenanceLogs.resourceId, resourceIds),
        ),
      )
      .orderBy(
        maintenanceLogs.resourceId,
        desc(maintenanceLogs.performedAt),
        desc(maintenanceLogs.createdAt),
      );
    return new Map(rows.map((r) => [r.resourceId, r]));
  }
  async resources(): Promise<MaintenanceResource[]> {
    const rows = await this.tx
      .select(resourceColumns)
      .from(resources)
      .innerJoin(spaces, eq(spaces.id, resources.spaceId))
      .where(
        and(
          eq(spaces.laboratoryId, this.context.laboratoryId),
          eq(spaces.isActive, true),
          eq(resources.isActive, true),
        ),
      )
      .orderBy(asc(spaces.name), asc(resources.name), asc(resources.id));
    const latest = await this.latest(rows.map((r) => r.id));
    return rows.map((r) => ({
      ...r,
      lastPerformedAt: latest.get(r.id)?.performedAt ?? null,
      nextDueOn: latest.get(r.id)?.nextDueOn ?? null,
    }));
  }
  private async resource(resourceId: string): Promise<MaintenanceResource> {
    // Deactivated resources keep a readable history inside their laboratory.
    const [row] = await this.tx
      .select(resourceColumns)
      .from(resources)
      .innerJoin(spaces, eq(spaces.id, resources.spaceId))
      .where(
        and(
          eq(resources.id, resourceId),
          eq(spaces.laboratoryId, this.context.laboratoryId),
        ),
      );
    if (!row) throw new MaintenanceError("not-found");
    const latest = (await this.latest([row.id])).get(row.id);
    return {
      ...row,
      lastPerformedAt: latest?.performedAt ?? null,
      nextDueOn: latest?.nextDueOn ?? null,
    };
  }
  private async logs(resourceId: string, logId?: string) {
    const rows = await this.tx
      .select({
        id: maintenanceLogs.id,
        laboratoryId: maintenanceLogs.laboratoryId,
        spaceId: maintenanceLogs.spaceId,
        resourceId: maintenanceLogs.resourceId,
        performedBy: maintenanceLogs.performedBy,
        performerName: users.name,
        type: maintenanceLogs.type,
        description: maintenanceLogs.description,
        statusBefore: maintenanceLogs.statusBefore,
        statusAfter: maintenanceLogs.statusAfter,
        performedAt: maintenanceLogs.performedAt,
        nextDueOn: maintenanceLogs.nextDueOn,
        incidentId: maintenanceLogs.incidentId,
        source: maintenanceLogs.source,
        createdAt: maintenanceLogs.createdAt,
      })
      .from(maintenanceLogs)
      .innerJoin(users, eq(users.id, maintenanceLogs.performedBy))
      .where(
        and(
          eq(maintenanceLogs.laboratoryId, this.context.laboratoryId),
          eq(maintenanceLogs.resourceId, resourceId),
          logId ? eq(maintenanceLogs.id, logId) : undefined,
        ),
      )
      .orderBy(
        desc(maintenanceLogs.performedAt),
        desc(maintenanceLogs.createdAt),
        desc(maintenanceLogs.id),
      );
    const materials = rows.length
      ? await this.tx
          .select({
            logId: maintenanceMaterials.maintenanceLogId,
            movementId: inventoryMovements.id,
            itemId: inventoryItems.id,
            itemName: inventoryItems.name,
            unit: inventoryItems.unit,
            quantity: inventoryMovements.quantity,
          })
          .from(maintenanceMaterials)
          .innerJoin(
            inventoryMovements,
            eq(inventoryMovements.id, maintenanceMaterials.movementId),
          )
          .innerJoin(
            inventoryItems,
            eq(inventoryItems.id, inventoryMovements.itemId),
          )
          .where(
            inArray(
              maintenanceMaterials.maintenanceLogId,
              rows.map((r) => r.id),
            ),
          )
          .orderBy(asc(inventoryItems.name), asc(inventoryItems.id))
      : [];
    return rows.map((r): MaintenanceLog => ({
      ...r,
      materials: materials
        .filter((m) => m.logId === r.id)
        .map(({ logId: _logId, ...m }) => {
          void _logId;
          return m;
        }),
    }));
  }
  async detail(resourceId: string) {
    const resource = await this.resource(resourceId);
    const [usage] = await this.tx
      .select({ value: count() })
      .from(resourceUsage)
      .where(
        and(
          eq(resourceUsage.resourceId, resourceId),
          isNull(resourceUsage.endedAt),
        ),
      );
    // Explicit resource reservations only; exclusive space bookings stay valid.
    const [reserved] = await this.tx
      .select({ value: count() })
      .from(reservations)
      .innerJoin(
        reservationResources,
        eq(reservationResources.reservationId, reservations.id),
      )
      .where(
        and(
          eq(reservationResources.resourceId, resourceId),
          eq(reservations.status, "confirmed"),
          gt(reservations.endsAt, sql`clock_timestamp()`),
        ),
      );
    return {
      resource,
      logs: await this.logs(resourceId),
      impact: { openUsages: usage.value, futureReservations: reserved.value },
    };
  }
  async options(resourceId: string, includeItems: boolean) {
    await this.resource(resourceId);
    const incidents = await this.tx
      .select({
        id: incidentReports.id,
        name: sql<string>`${incidentReports.targetSnapshot}->>'name'`,
        status: incidentReports.status,
        createdAt: incidentReports.createdAt,
      })
      .from(incidentReports)
      .where(
        and(
          eq(incidentReports.laboratoryId, this.context.laboratoryId),
          eq(incidentReports.resourceId, resourceId),
        ),
      )
      .orderBy(desc(incidentReports.createdAt), desc(incidentReports.id))
      .limit(50);
    const items = includeItems
      ? await this.tx
          .select({
            id: inventoryItems.id,
            name: inventoryItems.name,
            unit: inventoryItems.unit,
            quantity: inventoryStocks.quantity,
          })
          .from(inventoryItems)
          .innerJoin(
            inventoryStocks,
            eq(inventoryStocks.itemId, inventoryItems.id),
          )
          .where(
            and(
              eq(inventoryItems.laboratoryId, this.context.laboratoryId),
              eq(inventoryItems.isActive, true),
              eq(inventoryItems.type, "consumable"),
            ),
          )
          .orderBy(asc(inventoryItems.name), asc(inventoryItems.id))
      : [];
    return {
      incidents,
      items,
    };
  }
  async record(input: MaintenanceRecord) {
    if (input.materials.length)
      await authorizeLocked(this.tx, this.context, "inventory.adjust");
    const [ref] = await this.tx
      .select({ spaceId: resources.spaceId })
      .from(resources)
      .innerJoin(spaces, eq(spaces.id, resources.spaceId))
      .where(
        and(
          eq(resources.id, input.resourceId),
          eq(spaces.laboratoryId, this.context.laboratoryId),
        ),
      );
    if (!ref) throw new MaintenanceError("not-found");
    // Lock order Space -> Resource -> inventory items, as Reservations and Usage.
    const [space] = await this.tx
      .select()
      .from(spaces)
      .where(
        and(
          eq(spaces.id, ref.spaceId),
          eq(spaces.laboratoryId, this.context.laboratoryId),
        ),
      )
      .for("share");
    if (!space?.isActive) throw new MaintenanceError("not-found");
    const [resource] = await this.tx
      .select()
      .from(resources)
      .where(
        and(
          eq(resources.id, input.resourceId),
          eq(resources.spaceId, space.id),
        ),
      )
      .for("update");
    if (!resource?.isActive) throw new MaintenanceError("not-found");
    if (input.incidentId) {
      const [incident] = await this.tx
        .select({ id: incidentReports.id })
        .from(incidentReports)
        .where(
          and(
            eq(incidentReports.id, input.incidentId),
            eq(incidentReports.laboratoryId, this.context.laboratoryId),
            eq(incidentReports.resourceId, resource.id),
          ),
        );
      if (!incident) throw new MaintenanceError("relation");
    }
    const stocks = new Map<string, string | null>();
    for (const material of input.materials) {
      const [item] = await this.tx
        .select()
        .from(inventoryItems)
        .where(
          and(
            eq(inventoryItems.id, material.itemId),
            eq(inventoryItems.laboratoryId, this.context.laboratoryId),
          ),
        )
        .for("update");
      if (!item?.isActive || item.type !== "consumable")
        throw new MaintenanceError("material");
      // Read the balance after the item lock, in a new statement.
      const [stock] = await this.tx
        .select()
        .from(inventoryStocks)
        .where(eq(inventoryStocks.itemId, item.id));
      try {
        quantityInThousandths(material.quantity, item.unit);
        balanceAfter(stock.quantity, "consumption", material.quantity);
      } catch (error) {
        if (!(error instanceof InventoryError)) throw error;
        throw new MaintenanceError(
          error.code === "insufficient-stock"
            ? "insufficient-stock"
            : "material",
        );
      }
      stocks.set(item.id, stock.locationId);
    }
    const [log] = await this.tx
      .insert(maintenanceLogs)
      .values({
        laboratoryId: this.context.laboratoryId,
        spaceId: space.id,
        resourceId: resource.id,
        performedBy: this.context.actorUserId,
        type: input.type,
        description: input.description,
        // Replaced by the insert trigger with the locked resource status.
        statusBefore: resource.operationalStatus,
        statusAfter: input.statusAfter,
        performedAt: input.performedAt,
        nextDueOn: input.nextDueOn,
        incidentId: input.incidentId,
        source: input.source,
        createdAt: sql`clock_timestamp()`,
      })
      .returning({ id: maintenanceLogs.id });
    for (const material of input.materials) {
      // The inventory trigger owns balance arithmetic and the stock invariant.
      const [movement] = await this.tx
        .insert(inventoryMovements)
        .values({
          itemId: material.itemId,
          laboratoryId: this.context.laboratoryId,
          locationId: stocks.get(material.itemId) ?? null,
          type: "consumption",
          quantity: material.quantity,
          quantityBefore: "0",
          quantityAfter: "0",
          actorUserId: this.context.actorUserId,
          source: input.source,
          notes: `Mantenimiento: ${resource.name}`.slice(0, 1000),
        })
        .returning({ id: inventoryMovements.id });
      await this.tx.insert(maintenanceMaterials).values({
        maintenanceLogId: log.id,
        laboratoryId: this.context.laboratoryId,
        movementId: movement.id,
      });
    }
    const [created] = await this.logs(resource.id, log.id);
    return created;
  }
}
export class DrizzleMaintenanceStore implements MaintenanceStore {
  constructor(private readonly db: OperationDatabase) {}
  async run<T>(
    context: MaintenanceContext,
    permission: PermissionKey,
    operation: (
      tx: MaintenanceTransaction,
      permissionKeys: readonly string[],
    ) => Promise<T>,
  ): Promise<T> {
    maintenanceId(context.actorUserId);
    maintenanceId(context.laboratoryId);
    try {
      return await this.db.transaction(
        async (tx) => {
          const grant = await authorizeLocked(tx, context, permission);
          return operation(
            new DrizzleMaintenanceTransaction(tx, context),
            grant.permissionKeys,
          );
        },
        { isolationLevel: "read committed" },
      );
    } catch (error) {
      const pg = postgresError(error);
      if (pg.code === "23503") throw new MaintenanceError("not-found");
      if (pg.code === "23514") {
        if (pg.message?.includes("insufficient-stock"))
          throw new MaintenanceError("insufficient-stock");
        if (
          ["tool-consumption", "fractional pieces", "inactive"].some((m) =>
            pg.message?.includes(m),
          )
        )
          throw new MaintenanceError("material");
        throw new MaintenanceError("input");
      }
      throw error;
    }
  }
}
