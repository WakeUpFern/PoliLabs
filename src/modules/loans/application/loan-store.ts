import type { PermissionKey } from "@/modules/identity/domain/access-catalog";
import type {
  ItemLoanSummary,
  Loan,
  LoanContext,
  LoanFilter,
  LoanOptions,
  LoanRequest,
  ReturnRequest,
} from "../domain/loans";
export interface LoanTransaction {
  summary(itemId: string): Promise<ItemLoanSummary>;
  itemLoans(itemId: string, now: Date): Promise<Loan[]>;
  list(
    scope: { kind: "laboratory"; filter: LoanFilter } | { kind: "own" },
    now: Date,
  ): Promise<Loan[]>;
  options(): Promise<LoanOptions>;
  lend(request: LoanRequest, now: Date): Promise<Loan>;
  registerReturn(request: ReturnRequest, now: Date): Promise<Loan>;
}
export interface LoanStore {
  run<T>(
    context: LoanContext,
    permission: PermissionKey,
    operation: (
      tx: LoanTransaction,
      permissionKeys: readonly string[],
    ) => Promise<T>,
  ): Promise<T>;
}
