import type { PermissionKey } from "@/modules/identity/domain/access-catalog";
import type { ReportContext, ReportPeriod } from "../domain/reports";
import type {
  AttentionRow,
  IncidentRow,
  LoanRow,
  MaintenanceRow,
  MovementRow,
  StockRow,
} from "../domain/report-tables";
// Read-only projections scoped to the context laboratory. Each query returns at
// most `limit` rows so the service can reject oversized exports.
export interface ReportTransaction {
  header(): Promise<{ laboratoryName: string; actorName: string }>;
  inventoryStock(limit: number): Promise<StockRow[]>;
  inventoryMovements(
    period: ReportPeriod,
    limit: number,
  ): Promise<MovementRow[]>;
  loans(period: ReportPeriod, limit: number): Promise<LoanRow[]>;
  maintenance(period: ReportPeriod, limit: number): Promise<MaintenanceRow[]>;
  incidents(period: ReportPeriod, limit: number): Promise<IncidentRow[]>;
  // `dueBy` is an inclusive local date.
  resourceAttention(dueBy: string, limit: number): Promise<AttentionRow[]>;
}
export interface ReportStore {
  run<T>(
    context: ReportContext,
    permission: PermissionKey,
    operation: (
      tx: ReportTransaction,
      permissionKeys: readonly string[],
    ) => Promise<T>,
  ): Promise<T>;
}
