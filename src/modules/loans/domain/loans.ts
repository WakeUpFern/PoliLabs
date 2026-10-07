import {
  formatQuantity,
  InventoryError,
  quantityInThousandths,
} from "@/modules/inventory/domain/inventory";
export type LoanContext = { actorUserId: string; laboratoryId: string };
export type LoanSource = "WEB" | "API" | "AGENT" | "SYSTEM";
export const LOAN_STATUSES = ["active", "returned"] as const;
export type LoanStatus = (typeof LOAN_STATUSES)[number];
export const RETURN_CONDITIONS = ["good", "damaged", "lost"] as const;
export type ReturnCondition = (typeof RETURN_CONDITIONS)[number];
export const LOAN_FILTERS = ["active", "overdue"] as const;
export type LoanFilter = (typeof LOAN_FILTERS)[number];
export type LoanErrorCode =
  | "input"
  | "not-found"
  | "tool"
  | "borrower"
  | "session"
  | "unavailable"
  | "closed"
  | "excess-return";
export class LoanError extends Error {
  constructor(public readonly code: LoanErrorCode) {
    super(`Loan rejected: ${code}`);
    this.name = "LoanError";
  }
}
export function loanId(value: string) {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
    throw new LoanError("input");
  return value.toLowerCase();
}
export function loanSource(value: string): LoanSource {
  if (!["WEB", "API", "AGENT", "SYSTEM"].includes(value))
    throw new LoanError("input");
  return value as LoanSource;
}
// Reusable tools are counted in whole pieces; Inventory's exact arithmetic applies.
export function loanQuantity(value: string) {
  try {
    const quantity = quantityInThousandths(value.trim(), "piece");
    if (quantity === 0n) throw new LoanError("input");
    return formatQuantity(quantity);
  } catch (error) {
    if (error instanceof InventoryError) throw new LoanError("input");
    throw error;
  }
}
export function loanNotes(value: string | null | undefined, required = false) {
  const notes = (value ?? "").trim();
  if (notes.length > 1000 || (required && !notes)) throw new LoanError("input");
  return notes || null;
}
// The service receives an instant with offset; a commitment date must be ahead.
export function dueAt(value: string | null | undefined, now: Date) {
  if (!value) return null;
  if (!/(Z|[+-]\d{2}:\d{2})$/.test(value)) throw new LoanError("input");
  const instant = new Date(value);
  if (!Number.isFinite(instant.getTime()) || instant <= now)
    throw new LoanError("input");
  return instant;
}
export function returnCondition(value: string): ReturnCondition {
  if (!RETURN_CONDITIONS.includes(value as ReturnCondition))
    throw new LoanError("input");
  return value as ReturnCondition;
}
export function loanFilter(value: string | null | undefined): LoanFilter {
  if (!value) return "active";
  if (!LOAN_FILTERS.includes(value as LoanFilter)) throw new LoanError("input");
  return value as LoanFilter;
}
// Damage and loss leave the laboratory's stock through the matching movement.
export function returnMovementType(condition: ReturnCondition) {
  return condition === "damaged"
    ? "damage"
    : condition === "lost"
      ? "loss"
      : null;
}
export function outstanding(loan: {
  quantity: string;
  returnedQuantity: string;
}) {
  return formatQuantity(
    quantityInThousandths(loan.quantity) -
      quantityInThousandths(loan.returnedQuantity),
  );
}
// RB4/§14.5: a loan is temporary, so availability = stock − units still out.
export function availability(stock: string, loaned: string) {
  const available =
    quantityInThousandths(stock) - quantityInThousandths(loaned);
  return formatQuantity(available < 0n ? 0n : available);
}
export function assertAvailable(
  stock: string,
  loaned: string,
  quantity: string,
) {
  if (
    quantityInThousandths(quantity) >
    quantityInThousandths(stock) - quantityInThousandths(loaned)
  )
    throw new LoanError("unavailable");
}
export function assertReturnable(
  loan: { status: LoanStatus; quantity: string; returnedQuantity: string },
  quantity: string,
) {
  if (loan.status !== "active") throw new LoanError("closed");
  if (
    quantityInThousandths(quantity) > quantityInThousandths(outstanding(loan))
  )
    throw new LoanError("excess-return");
}
export function isOverdue(
  loan: { status: LoanStatus; dueAt: Date | null },
  now: Date,
) {
  return loan.status === "active" && loan.dueAt !== null && loan.dueAt <= now;
}
export type LoanRequest = {
  itemId: string;
  borrowerUserId: string;
  quantity: string;
  dueAt: Date | null;
  sessionId: string | null;
  notes: string | null;
  source: LoanSource;
};
export type ReturnRequest = {
  loanId: string;
  quantity: string;
  condition: ReturnCondition;
  notes: string | null;
  source: LoanSource;
};
export type LoanReturn = {
  id: string;
  quantity: string;
  condition: ReturnCondition;
  notes: string | null;
  movementId: string | null;
  actorUserId: string;
  actorName: string;
  source: LoanSource;
  returnedAt: Date;
};
export type Loan = {
  id: string;
  laboratoryId: string;
  itemId: string;
  itemName: string;
  borrowerUserId: string;
  borrowerName: string;
  quantity: string;
  returnedQuantity: string;
  outstanding: string;
  status: LoanStatus;
  loanedAt: Date;
  dueAt: Date | null;
  closedAt: Date | null;
  overdue: boolean;
  sessionId: string | null;
  sessionLabel: string | null;
  actorUserId: string;
  actorName: string;
  source: LoanSource;
  notes: string | null;
  returns: LoanReturn[];
};
export type ItemLoanSummary = {
  itemId: string;
  itemType: "consumable" | "reusable_tool";
  isActive: boolean;
  stock: string;
  loaned: string;
  available: string;
};
export type LoanOptions = {
  members: { id: string; name: string }[];
  sessions: { id: string; label: string; startsAt: Date }[];
};
