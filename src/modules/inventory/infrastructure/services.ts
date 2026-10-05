import "server-only";
import { getDatabase } from "@/infrastructure/database/client";
import {
  ListInventory,
  GetInventoryItem,
  CreateInventoryItem,
  UpdateInventoryItem,
  DeactivateInventoryItem,
  RecordInventoryMovement,
} from "../application/inventory";
import { DrizzleInventoryStore } from "./inventory-store";
const store = new DrizzleInventoryStore(getDatabase());
export const listInventory = new ListInventory(store);
export const getInventoryItem = new GetInventoryItem(store);
export const createInventoryItem = new CreateInventoryItem(store);
export const updateInventoryItem = new UpdateInventoryItem(store);
export const deactivateInventoryItem = new DeactivateInventoryItem(store);
export const recordInventoryMovement = new RecordInventoryMovement(store);
