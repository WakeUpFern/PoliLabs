import type { PermissionKey } from "@/modules/identity/domain/access-catalog";
import type {
  InventoryItem,
  InventoryMovement,
  ItemType,
  Unit,
  Source,
  MovementType,
} from "../domain/inventory";
export type ActorContext = { actorUserId: string; laboratoryId: string };
export type ItemValues = {
  name: string;
  type: ItemType;
  unit: Unit;
  locationId: string | null;
};
export type MovementValues = {
  type: MovementType;
  quantity: string;
  notes: string;
  source: Source;
};
export interface InventorySession {
  list(
    context: ActorContext,
    filter: { search: string; type?: ItemType; includeInactive: boolean },
  ): Promise<InventoryItem[]>;
  get(
    context: ActorContext,
    itemId: string,
    lock?: boolean,
  ): Promise<InventoryItem>;
  history(context: ActorContext, itemId: string): Promise<InventoryMovement[]>;
  create(
    context: ActorContext,
    values: ItemValues,
    source: Source,
  ): Promise<InventoryItem>;
  update(
    context: ActorContext,
    itemId: string,
    values: ItemValues,
    source: Source,
  ): Promise<InventoryItem>;
  deactivate(
    context: ActorContext,
    itemId: string,
    source: Source,
  ): Promise<void>;
  record(
    context: ActorContext,
    itemId: string,
    values: MovementValues,
  ): Promise<InventoryMovement>;
}
export interface InventoryStore {
  run<T>(
    context: ActorContext,
    permissions: readonly PermissionKey[],
    operation: (session: InventorySession) => Promise<T>,
  ): Promise<T>;
}
