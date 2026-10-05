import "server-only";
import { requireCurrentActor } from "@/app/_lib/current-actor";
import { getLaboratoryBySlug } from "@/modules/identity/infrastructure/services";
import { AuthorizationService } from "@/modules/identity/application/authorization-service";
import { DrizzleAuthorizationReader } from "@/modules/identity/infrastructure/access-repository";
import { getDatabase } from "@/infrastructure/database/client";
import {
  listSpaces,
  listLocations,
} from "@/modules/spatial/infrastructure/services";
import {
  listInventory,
  getInventoryItem,
  createInventoryItem,
  updateInventoryItem,
  deactivateInventoryItem,
  recordInventoryMovement,
} from "../infrastructure/services";
import { InventoryWeb } from "./inventory-web";
export const inventoryWeb = new InventoryWeb({
  currentActor: requireCurrentActor,
  laboratory: getLaboratoryBySlug,
  authorization: new AuthorizationService(
    new DrizzleAuthorizationReader(getDatabase()),
  ),
  spaces: listSpaces,
  locations: listLocations,
  list: listInventory,
  get: getInventoryItem,
  create: createInventoryItem,
  update: updateInventoryItem,
  deactivate: deactivateInventoryItem,
  record: recordInventoryMovement,
});
