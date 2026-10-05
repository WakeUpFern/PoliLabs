import {
  InventoryError,
  normalizeItem,
  requireId,
  validateMovement,
  quantityInThousandths,
  balanceAfter,
  SOURCES,
  ITEM_TYPES,
  type ItemType,
  type Source,
} from "../domain/inventory";
import type { ActorContext, InventoryStore } from "./inventory-store";
type ItemInput = ActorContext & {
  name: string;
  type: string;
  unit: string;
  locationId?: string | null;
  source: string;
};
function source(value: string): Source {
  if (!SOURCES.includes(value as Source)) throw new InventoryError("input");
  return value as Source;
}
function itemValues(input: ItemInput) {
  const locationId = input.locationId?.trim() || null;
  if (locationId) requireId(locationId);
  return { ...normalizeItem(input), locationId };
}
export class ListInventory {
  constructor(private readonly store: InventoryStore) {}
  execute(
    input: ActorContext & {
      search?: string;
      type?: string;
      includeInactive?: boolean;
    },
  ) {
    const search = (input.search ?? "").trim();
    if (
      search.length > 200 ||
      (input.type && !ITEM_TYPES.includes(input.type as ItemType))
    )
      throw new InventoryError("input");
    return this.store.run(input, ["inventory.read"], (session) =>
      session.list(input, {
        search,
        type: input.type as ItemType | undefined,
        includeInactive: input.includeInactive ?? false,
      }),
    );
  }
}
export class GetInventoryItem {
  constructor(private readonly store: InventoryStore) {}
  execute(input: ActorContext & { itemId: string }) {
    requireId(input.itemId);
    return this.store.run(input, ["inventory.read"], async (session) => {
      const item = await session.get(input, input.itemId, true);
      return { item, movements: await session.history(input, input.itemId) };
    });
  }
}
export class CreateInventoryItem {
  constructor(private readonly store: InventoryStore) {}
  execute(input: ItemInput & { initialQuantity?: string; notes?: string }) {
    const values = itemValues(input);
    const origin = source(input.source);
    const initialQuantity = input.initialQuantity ?? "0";
    const amount = quantityInThousandths(initialQuantity, values.unit);
    const movement =
      amount > 0n
        ? validateMovement(
            {
              type: "initial",
              quantity: initialQuantity,
              notes: input.notes ?? "",
              source: origin,
            },
            values,
          )
        : null;
    return this.store.run(
      input,
      movement
        ? ["inventory.manage", "inventory.adjust"]
        : ["inventory.manage"],
      async (session) => {
        const item = await session.create(input, values, origin);
        if (movement) await session.record(input, item.id, movement);
        return session.get(input, item.id);
      },
    );
  }
}
export class UpdateInventoryItem {
  constructor(private readonly store: InventoryStore) {}
  execute(input: ItemInput & { itemId: string }) {
    requireId(input.itemId);
    const values = itemValues(input);
    const origin = source(input.source);
    return this.store.run(input, ["inventory.manage"], async (session) => {
      const item = await session.get(input, input.itemId, true);
      if (!item.isActive) throw new InventoryError("inactive");
      if (
        (item.type !== values.type || item.unit !== values.unit) &&
        (await session.history(input, item.id)).length
      )
        throw new InventoryError("immutable-unit");
      return session.update(input, item.id, values, origin);
    });
  }
}
export class DeactivateInventoryItem {
  constructor(private readonly store: InventoryStore) {}
  execute(input: ActorContext & { itemId: string; source: string }) {
    requireId(input.itemId);
    const origin = source(input.source);
    return this.store.run(input, ["inventory.manage"], async (session) => {
      const item = await session.get(input, input.itemId, true);
      if (quantityInThousandths(item.quantity) !== 0n)
        throw new InventoryError("has-stock");
      if (item.isActive) await session.deactivate(input, item.id, origin);
    });
  }
}
export class RecordInventoryMovement {
  constructor(private readonly store: InventoryStore) {}
  execute(
    input: ActorContext & {
      itemId: string;
      type: string;
      quantity: string;
      notes: string;
      source: string;
    },
  ) {
    requireId(input.itemId);
    // Initial stock belongs only to creation, preventing later second initializations.
    if (input.type === "initial") throw new InventoryError("input");
    return this.store.run(input, ["inventory.adjust"], async (session) => {
      const item = await session.get(input, input.itemId, true);
      if (!item.isActive) throw new InventoryError("inactive");
      const movement = validateMovement(input, item);
      balanceAfter(item.quantity, movement.type, movement.quantity);
      return session.record(input, item.id, movement);
    });
  }
}
