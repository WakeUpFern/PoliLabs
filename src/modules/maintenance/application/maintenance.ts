import {
  formatQuantity,
  InventoryError,
  quantityInThousandths,
} from "@/modules/inventory/domain/inventory";
import {
  maintenanceId,
  maintenanceMaterials,
  maintenanceSource,
  maintenanceText,
  maintenanceType,
  MaintenanceError,
  nextDueOn,
  operationalStatus,
  performedAt,
  type MaintenanceContext,
  type MaterialRequest,
} from "../domain/maintenance";
import type { MaintenanceStore } from "./maintenance-store";
function materialQuantity(value: string) {
  try {
    const quantity = quantityInThousandths(value);
    if (quantity === 0n) throw new MaintenanceError("input");
    return formatQuantity(quantity);
  } catch (error) {
    if (error instanceof InventoryError) throw new MaintenanceError("input");
    throw error;
  }
}
export class MaintenanceService {
  constructor(
    private readonly store: MaintenanceStore,
    private readonly clock: () => Date = () => new Date(),
  ) {}
  access(context: MaintenanceContext) {
    return this.store.run(context, "laboratory.read", async (_tx, keys) => ({
      canRead: keys.includes("maintenance.read"),
      canCreate: keys.includes("maintenance.create"),
      canConsume: keys.includes("inventory.adjust"),
    }));
  }
  resources(context: MaintenanceContext) {
    return this.store.run(context, "maintenance.read", (tx) => tx.resources());
  }
  detail(input: MaintenanceContext & { resourceId: string }) {
    const id = maintenanceId(input.resourceId);
    return this.store.run(input, "maintenance.read", (tx) => tx.detail(id));
  }
  options(input: MaintenanceContext & { resourceId: string }) {
    const id = maintenanceId(input.resourceId);
    return this.store.run(input, "maintenance.create", (tx, keys) =>
      tx.options(id, keys.includes("inventory.adjust")),
    );
  }
  record(
    input: MaintenanceContext & {
      resourceId: string;
      type: string;
      description: string;
      statusAfter: string;
      performedAt: string;
      nextDueOn?: string | null;
      incidentId?: string | null;
      materials?: readonly MaterialRequest[];
      source: string;
    },
  ) {
    const performed = performedAt(input.performedAt, this.clock());
    const record = {
      resourceId: maintenanceId(input.resourceId),
      type: maintenanceType(input.type),
      description: maintenanceText(input.description),
      statusAfter: operationalStatus(input.statusAfter),
      performedAt: performed,
      nextDueOn: nextDueOn(input.nextDueOn, performed),
      incidentId: input.incidentId ? maintenanceId(input.incidentId) : null,
      materials: maintenanceMaterials(input.materials ?? []).map((m) => ({
        itemId: m.itemId,
        quantity: materialQuantity(m.quantity),
      })),
      source: maintenanceSource(input.source),
    };
    // Consumption requires inventory.adjust, revalidated by the store under lock.
    return this.store.run(input, "maintenance.create", (tx) =>
      tx.record(record),
    );
  }
}
