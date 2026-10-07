import type { PermissionKey } from "@/modules/identity/domain/access-catalog";
import type {
  IncidentContext,
  IncidentScope,
  IncidentReport,
  IncidentSource,
  IncidentListEntry,
  IncidentEvent,
  IncidentUsage,
  IncidentOptions,
} from "../domain/incidents";
export interface IncidentTransaction {
  options(): Promise<IncidentOptions>;
  report(input: IncidentReport): Promise<IncidentListEntry>;
  list(scope: IncidentScope): Promise<IncidentListEntry[]>;
  detail(
    id: string,
    scope: IncidentScope,
  ): Promise<{
    incident: IncidentListEntry;
    events: IncidentEvent[];
    relatedUsage: IncidentUsage | null;
  }>;
  transition(
    id: string,
    input: {
      next: string;
      expectedVersion: number;
      note: string;
      source: IncidentSource;
    },
  ): Promise<IncidentListEntry>;
  trace(id: string): Promise<IncidentUsage[]>;
}
export interface IncidentStore {
  run<T>(
    context: IncidentContext,
    permission: PermissionKey,
    operation: (
      tx: IncidentTransaction,
      permissionKeys: readonly string[],
    ) => Promise<T>,
  ): Promise<T>;
}
