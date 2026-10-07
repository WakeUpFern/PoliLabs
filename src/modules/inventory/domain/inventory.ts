export const ITEM_TYPES = ["consumable", "reusable_tool"] as const;
export const UNITS = ["piece", "metre", "litre", "kilogram"] as const;
export const MOVEMENT_TYPES = [
  "initial",
  "purchase",
  "entry",
  "consumption",
  "damage",
  "loss",
  "adjustment_in",
  "adjustment_out",
] as const;
export const SOURCES = ["WEB", "API", "AGENT", "SYSTEM"] as const;
export type ItemType = (typeof ITEM_TYPES)[number];
export type Unit = (typeof UNITS)[number];
export type MovementType = (typeof MOVEMENT_TYPES)[number];
export type Source = (typeof SOURCES)[number];
export type InventoryErrorCode =
  | "input"
  | "not-found"
  | "location"
  | "insufficient-stock"
  | "has-stock"
  | "immutable-unit"
  | "inactive"
  | "tool-consumption"
  | "loaned-stock";
export class InventoryError extends Error {
  constructor(public readonly code: InventoryErrorCode) {
    super(`Inventory operation rejected: ${code}`);
    this.name = "InventoryError";
  }
}
export function requireId(value: string) {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
    throw new InventoryError("input");
  return value;
}
export function normalizeItem(input: {
  name: string;
  type: string;
  unit: string;
}) {
  const name = input.name.trim();
  if (
    !name ||
    name.length > 200 ||
    !ITEM_TYPES.includes(input.type as ItemType) ||
    !UNITS.includes(input.unit as Unit)
  )
    throw new InventoryError("input");
  if (input.type === "reusable_tool" && input.unit !== "piece")
    throw new InventoryError("input");
  return { name, type: input.type as ItemType, unit: input.unit as Unit };
}
// Exact thousandths; no binary floating point enters stock arithmetic.
const MAX_QUANTITY = 999999999999999999n;
export function quantityInThousandths(value: string, unit?: Unit): bigint {
  if (!/^(0|[1-9]\d{0,14})(\.\d{1,3})?$/.test(value))
    throw new InventoryError("input");
  const [whole, fraction = ""] = value.split(".");
  const result = BigInt(whole) * 1000n + BigInt(fraction.padEnd(3, "0"));
  if (result > MAX_QUANTITY || (unit === "piece" && result % 1000n !== 0n))
    throw new InventoryError("input");
  return result;
}
export function formatQuantity(value: bigint) {
  const sign = value < 0n ? "-" : "";
  const magnitude = value < 0n ? -value : value;
  return `${sign}${magnitude / 1000n}.${String(magnitude % 1000n).padStart(3, "0")}`;
}
export function movementDelta(type: MovementType, quantity: bigint) {
  return ["consumption", "damage", "loss", "adjustment_out"].includes(type)
    ? -quantity
    : quantity;
}
export function validateMovement(
  input: { type: string; quantity: string; notes: string; source: string },
  item: { type: ItemType; unit: Unit },
) {
  if (
    !MOVEMENT_TYPES.includes(input.type as MovementType) ||
    !SOURCES.includes(input.source as Source)
  )
    throw new InventoryError("input");
  const quantity = quantityInThousandths(input.quantity, item.unit);
  const notes = input.notes.trim();
  if (quantity === 0n || !notes || notes.length > 1000)
    throw new InventoryError("input");
  if (item.type === "reusable_tool" && input.type === "consumption")
    throw new InventoryError("tool-consumption");
  return {
    type: input.type as MovementType,
    quantity: formatQuantity(quantity),
    notes,
    source: input.source as Source,
  };
}
export function balanceAfter(
  current: string,
  type: MovementType,
  quantity: string,
) {
  const next =
    quantityInThousandths(current) +
    movementDelta(type, quantityInThousandths(quantity));
  if (next < 0n) throw new InventoryError("insufficient-stock");
  if (next > MAX_QUANTITY) throw new InventoryError("input");
  return formatQuantity(next);
}
export type InventoryItem = {
  id: string;
  laboratoryId: string;
  name: string;
  type: ItemType;
  unit: Unit;
  isActive: boolean;
  quantity: string;
  locationId: string | null;
};
export type InventoryMovement = {
  id: string;
  itemId: string;
  locationId: string | null;
  type: MovementType;
  quantity: string;
  quantityBefore: string;
  quantityAfter: string;
  actorUserId: string;
  source: Source;
  notes: string;
  createdAt: Date;
};
