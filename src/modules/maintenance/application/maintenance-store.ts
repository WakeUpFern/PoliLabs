import type { PermissionKey } from "@/modules/identity/domain/access-catalog";
import type {
  MaintenanceContext,
  MaintenanceImpact,
  MaintenanceLog,
  MaintenanceOptions,
  MaintenanceRecord,
  MaintenanceResource,
} from "../domain/maintenance";
export interface MaintenanceTransaction {
  resources(): Promise<MaintenanceResource[]>;
  detail(resourceId: string): Promise<{
    resource: MaintenanceResource;
    logs: MaintenanceLog[];
    impact: MaintenanceImpact;
  }>;
  options(
    resourceId: string,
    includeItems: boolean,
  ): Promise<MaintenanceOptions>;
  record(input: MaintenanceRecord): Promise<MaintenanceLog>;
}
export interface MaintenanceStore {
  run<T>(
    context: MaintenanceContext,
    permission: PermissionKey,
    operation: (
      tx: MaintenanceTransaction,
      permissionKeys: readonly string[],
    ) => Promise<T>,
  ): Promise<T>;
}
