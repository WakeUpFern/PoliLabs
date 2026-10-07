import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "@/infrastructure/database/schema";
import { AuthorizationService } from "@/modules/identity/application/authorization-service";
import { DrizzleAuthorizationReader } from "@/modules/identity/infrastructure/access-repository";
import { AuthorizationDeniedError } from "@/modules/identity/domain/access-errors";
import type { PermissionKey } from "@/modules/identity/domain/access-catalog";
import {
  laboratories,
  laboratoryMemberships,
  membershipRoles,
  permissions,
  rolePermissions,
  roles,
} from "@/modules/identity/infrastructure/access-schema";
import { users } from "@/modules/identity/infrastructure/auth-schema";
import {
  InventoryError,
  requireId,
  type InventoryItem,
  type Source,
} from "../domain/inventory";
import type {
  ActorContext,
  InventorySession,
  InventoryStore,
  ItemValues,
  MovementValues,
} from "../application/inventory-store";
import {
  inventoryItems as items,
  inventoryStocks as stocks,
  inventoryMovements as movements,
  inventoryEvents as events,
} from "./inventory-schema";
type Database = NodePgDatabase<typeof schema>;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
function postgresError(error: unknown): { code?: string; message?: string } {
  if (!error || typeof error !== "object") return {};
  if ("code" in error) return error as { code: string; message?: string };
  if ("cause" in error) return postgresError(error.cause);
  return {};
}
const selection = {
  id: items.id,
  laboratoryId: items.laboratoryId,
  name: items.name,
  type: items.type,
  unit: items.unit,
  isActive: items.isActive,
  quantity: stocks.quantity,
  locationId: stocks.locationId,
};
class DrizzleInventorySession implements InventorySession {
  constructor(private readonly tx: Transaction) {}
  async list(
    context: ActorContext,
    filter: Parameters<InventorySession["list"]>[1],
  ) {
    return this.tx
      .select(selection)
      .from(items)
      .innerJoin(stocks, eq(stocks.itemId, items.id))
      .where(
        and(
          eq(items.laboratoryId, context.laboratoryId),
          filter.includeInactive ? undefined : eq(items.isActive, true),
          filter.type ? eq(items.type, filter.type) : undefined,
          filter.search
            ? sql`strpos(lower(${items.name}), lower(${filter.search})) > 0`
            : undefined,
        ),
      )
      .orderBy(asc(items.name), asc(items.id));
  }
  async get(
    context: ActorContext,
    itemId: string,
    lock = false,
  ): Promise<InventoryItem> {
    const query = this.tx
      .select(selection)
      .from(items)
      .innerJoin(stocks, eq(stocks.itemId, items.id))
      .where(
        and(eq(items.id, itemId), eq(items.laboratoryId, context.laboratoryId)),
      );
    if (lock) {
      // Acquire the item lock first. Read the joined balance in a new statement
      // after any wait, since movements update stocks without updating items.
      const [target] = await this.tx
        .select({ id: items.id })
        .from(items)
        .where(
          and(
            eq(items.id, itemId),
            eq(items.laboratoryId, context.laboratoryId),
          ),
        )
        .for("update");
      if (!target) throw new InventoryError("not-found");
    }
    const [row] = await query;
    if (!row) throw new InventoryError("not-found");
    return row;
  }
  async history(context: ActorContext, itemId: string) {
    return this.tx
      .select()
      .from(movements)
      .where(
        and(
          eq(movements.itemId, itemId),
          eq(movements.laboratoryId, context.laboratoryId),
        ),
      )
      .orderBy(desc(movements.createdAt), desc(movements.id));
  }
  private async audit(
    context: ActorContext,
    itemId: string,
    action: "created" | "updated" | "deactivated",
    source: Source,
  ) {
    await this.tx.insert(events).values({
      itemId,
      actorUserId: context.actorUserId,
      action,
      source,
      snapshot: await this.get(context, itemId),
    });
  }
  async create(context: ActorContext, values: ItemValues, source: Source) {
    const [row] = await this.tx
      .insert(items)
      .values({
        laboratoryId: context.laboratoryId,
        name: values.name,
        type: values.type,
        unit: values.unit,
      })
      .returning();
    await this.tx
      .insert(stocks)
      .values({ itemId: row.id, locationId: values.locationId });
    await this.audit(context, row.id, "created", source);
    return this.get(context, row.id);
  }
  async update(
    context: ActorContext,
    itemId: string,
    values: ItemValues,
    source: Source,
  ) {
    await this.tx
      .update(items)
      .set({
        name: values.name,
        type: values.type,
        unit: values.unit,
        updatedAt: new Date(),
      })
      .where(
        and(eq(items.id, itemId), eq(items.laboratoryId, context.laboratoryId)),
      );
    await this.tx
      .update(stocks)
      .set({ locationId: values.locationId })
      .where(eq(stocks.itemId, itemId));
    await this.audit(context, itemId, "updated", source);
    return this.get(context, itemId);
  }
  async deactivate(context: ActorContext, itemId: string, source: Source) {
    await this.tx
      .update(items)
      .set({ isActive: false, updatedAt: new Date() })
      .where(
        and(eq(items.id, itemId), eq(items.laboratoryId, context.laboratoryId)),
      );
    await this.audit(context, itemId, "deactivated", source);
  }
  async record(context: ActorContext, itemId: string, values: MovementValues) {
    const current = await this.get(context, itemId, true);
    // BEFORE INSERT owns exact balance arithmetic; both writes belong to this transaction.
    const [row] = await this.tx
      .insert(movements)
      .values({
        ...values,
        itemId,
        laboratoryId: context.laboratoryId,
        actorUserId: context.actorUserId,
        locationId: current.locationId,
        quantityBefore: "0",
        quantityAfter: "0",
      })
      .returning();
    return row;
  }
}
export class DrizzleInventoryStore implements InventoryStore {
  constructor(private readonly database: Database) {}
  async run<T>(
    context: ActorContext,
    required: readonly PermissionKey[],
    operation: (session: InventorySession) => Promise<T>,
  ): Promise<T> {
    try {
      requireId(context.actorUserId);
      requireId(context.laboratoryId);
    } catch {
      throw new AuthorizationDeniedError();
    }
    try {
      return await this.database.transaction(
        async (tx) => {
          for (const permission of [...required].sort()) {
            // Protect membership, actor, lab and concrete permission paths until commit.
            await tx
              .select({ id: laboratoryMemberships.id })
              .from(users)
              .innerJoin(
                laboratoryMemberships,
                and(
                  eq(laboratoryMemberships.userId, users.id),
                  eq(laboratoryMemberships.laboratoryId, context.laboratoryId),
                ),
              )
              .innerJoin(
                laboratories,
                eq(laboratories.id, laboratoryMemberships.laboratoryId),
              )
              .innerJoin(
                membershipRoles,
                eq(membershipRoles.membershipId, laboratoryMemberships.id),
              )
              .innerJoin(roles, eq(roles.id, membershipRoles.roleId))
              .innerJoin(rolePermissions, eq(rolePermissions.roleId, roles.id))
              .innerJoin(
                permissions,
                and(
                  eq(permissions.id, rolePermissions.permissionId),
                  eq(permissions.key, permission),
                ),
              )
              .where(eq(users.id, context.actorUserId))
              .for("share");
            await new AuthorizationService(
              new DrizzleAuthorizationReader(tx),
            ).authorize({ ...context, requiredPermission: permission });
          }
          return operation(new DrizzleInventorySession(tx));
        },
        { isolationLevel: "read committed" },
      );
    } catch (error) {
      const pg = postgresError(error);
      if (pg.code === "23503") throw new InventoryError("location");
      if (pg.code === "23514" || pg.code === "22003") {
        const known = [
          "insufficient-stock",
          "has-stock",
          "immutable-unit",
          "inactive",
          "tool-consumption",
          "loaned-stock",
        ] as const;
        throw new InventoryError(
          known.find((value) => pg.message?.includes(value)) ?? "input",
        );
      }
      throw error;
    }
  }
}
