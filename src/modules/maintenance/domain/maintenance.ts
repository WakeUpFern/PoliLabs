import {
  OPERATIONAL_STATUSES,
  type OperationalStatus,
} from "@/modules/spatial/domain/resource";
export { OPERATIONAL_STATUSES, type OperationalStatus };
export type MaintenanceContext = { actorUserId: string; laboratoryId: string };
export type MaintenanceSource = "WEB" | "API" | "AGENT" | "SYSTEM";
export const MAINTENANCE_TYPES = [
  "preventive",
  "corrective",
  "inspection",
  "other",
] as const;
export type MaintenanceType = (typeof MAINTENANCE_TYPES)[number];
export const MAX_MAINTENANCE_MATERIALS = 20;
export class MaintenanceError extends Error {
  constructor(
    public readonly code:
      "input" | "not-found" | "relation" | "material" | "insufficient-stock",
  ) {
    super(`Maintenance rejected: ${code}`);
    this.name = "MaintenanceError";
  }
}
export function maintenanceId(value: string) {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
    throw new MaintenanceError("input");
  return value.toLowerCase();
}
export function maintenanceSource(value: string): MaintenanceSource {
  if (!["WEB", "API", "AGENT", "SYSTEM"].includes(value))
    throw new MaintenanceError("input");
  return value as MaintenanceSource;
}
export function maintenanceType(value: string): MaintenanceType {
  if (!MAINTENANCE_TYPES.includes(value as MaintenanceType))
    throw new MaintenanceError("input");
  return value as MaintenanceType;
}
export function operationalStatus(value: string): OperationalStatus {
  if (!OPERATIONAL_STATUSES.includes(value as OperationalStatus))
    throw new MaintenanceError("input");
  return value as OperationalStatus;
}
export function isAvailableStatus(status: OperationalStatus) {
  return status === "operational";
}
export function maintenanceText(value: string, maximum = 5000) {
  const result = value.trim();
  if (!result || result.length > maximum) throw new MaintenanceError("input");
  return result;
}
// The service receives an instant with offset; the user states when work happened.
export function performedAt(value: string, now: Date) {
  if (!/(Z|[+-]\d{2}:\d{2})$/.test(value)) throw new MaintenanceError("input");
  const instant = new Date(value);
  if (!Number.isFinite(instant.getTime()) || instant > now)
    throw new MaintenanceError("input");
  return instant;
}
// Calendar date only. Compared with the UTC date of the work as a basic
// sanity bound; it does not model laboratory-specific time zones.
export function nextDueOn(value: string | null | undefined, performed: Date) {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new MaintenanceError("input");
  const parsed = new Date(`${value}T00:00:00Z`);
  if (
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value ||
    value < performed.toISOString().slice(0, 10)
  )
    throw new MaintenanceError("input");
  return value;
}
export type MaterialRequest = { itemId: string; quantity: string };
export function maintenanceMaterials(
  values: readonly MaterialRequest[],
): MaterialRequest[] {
  if (values.length > MAX_MAINTENANCE_MATERIALS)
    throw new MaintenanceError("input");
  const result = values.map((m) => ({
    itemId: maintenanceId(m.itemId),
    quantity: m.quantity.trim(),
  }));
  if (new Set(result.map((m) => m.itemId)).size !== result.length)
    throw new MaintenanceError("input");
  // Stable item order keeps inventory row locks deadlock-free.
  return result.sort((a, b) => a.itemId.localeCompare(b.itemId));
}
export type MaintenanceRecord = {
  resourceId: string;
  type: MaintenanceType;
  description: string;
  statusAfter: OperationalStatus;
  performedAt: Date;
  nextDueOn: string | null;
  incidentId: string | null;
  materials: MaterialRequest[];
  source: MaintenanceSource;
};
export type MaintenanceMaterial = {
  movementId: string;
  itemId: string;
  itemName: string;
  unit: string;
  quantity: string;
};
export type MaintenanceLog = {
  id: string;
  laboratoryId: string;
  spaceId: string;
  resourceId: string;
  performedBy: string;
  performerName: string;
  type: MaintenanceType;
  description: string;
  statusBefore: OperationalStatus;
  statusAfter: OperationalStatus;
  performedAt: Date;
  nextDueOn: string | null;
  incidentId: string | null;
  source: MaintenanceSource;
  createdAt: Date;
  materials: MaintenanceMaterial[];
};
export type MaintenanceResource = {
  id: string;
  name: string;
  spaceId: string;
  spaceName: string;
  operationalStatus: OperationalStatus;
  lastPerformedAt: Date | null;
  nextDueOn: string | null;
};
export type MaintenanceImpact = {
  openUsages: number;
  futureReservations: number;
};
export type MaintenanceOptions = {
  incidents: {
    id: string;
    name: string;
    status: "open" | "in_review" | "resolved";
    createdAt: Date;
  }[];
  items: { id: string; name: string; unit: string; quantity: string }[];
};
