import {
  dueAt,
  loanFilter,
  loanId,
  loanNotes,
  loanQuantity,
  loanSource,
  returnCondition,
  type LoanContext,
} from "../domain/loans";
import type { LoanStore } from "./loan-store";
export class LoanService {
  constructor(
    private readonly store: LoanStore,
    private readonly clock: () => Date = () => new Date(),
  ) {}
  async access(context: LoanContext) {
    return this.store.run(context, "laboratory.read", async (_tx, keys) => ({
      canManage: keys.includes("inventory.loan"),
      canReadOwn: keys.includes("inventory.loan.read"),
      canAdjust: keys.includes("inventory.adjust"),
      canReadInventory: keys.includes("inventory.read"),
    }));
  }
  // Totals for any inventory reader; borrower identities only with inventory.loan.
  async itemLoans(input: LoanContext & { itemId: string }) {
    const id = loanId(input.itemId);
    return this.store.run(input, "inventory.read", async (tx, keys) => ({
      summary: await tx.summary(id),
      loans: keys.includes("inventory.loan")
        ? await tx.itemLoans(id, this.clock())
        : null,
    }));
  }
  async laboratoryLoans(input: LoanContext & { filter?: string | null }) {
    const filter = loanFilter(input.filter);
    return this.store.run(input, "inventory.loan", (tx) =>
      tx.list({ kind: "laboratory", filter }, this.clock()),
    );
  }
  async ownLoans(context: LoanContext) {
    return this.store.run(context, "inventory.loan.read", (tx) =>
      tx.list({ kind: "own" }, this.clock()),
    );
  }
  async options(context: LoanContext) {
    return this.store.run(context, "inventory.loan", (tx) => tx.options());
  }
  async lend(
    input: LoanContext & {
      itemId: string;
      borrowerUserId: string;
      quantity: string;
      dueAt?: string | null;
      sessionId?: string | null;
      notes?: string | null;
      source: string;
    },
  ) {
    const now = this.clock();
    const request = {
      itemId: loanId(input.itemId),
      borrowerUserId: loanId(input.borrowerUserId),
      quantity: loanQuantity(input.quantity),
      dueAt: dueAt(input.dueAt, now),
      sessionId: input.sessionId ? loanId(input.sessionId) : null,
      notes: loanNotes(input.notes),
      source: loanSource(input.source),
    };
    // Availability is revalidated by the store under the item lock.
    return this.store.run(input, "inventory.loan", (tx) =>
      tx.lend(request, this.clock()),
    );
  }
  async registerReturn(
    input: LoanContext & {
      loanId: string;
      quantity: string;
      condition: string;
      notes?: string | null;
      source: string;
    },
  ) {
    const condition = returnCondition(input.condition);
    const request = {
      loanId: loanId(input.loanId),
      quantity: loanQuantity(input.quantity),
      condition,
      notes: loanNotes(input.notes, condition !== "good"),
      source: loanSource(input.source),
    };
    // Damage or loss additionally requires inventory.adjust, checked under lock.
    return this.store.run(input, "inventory.loan", (tx) =>
      tx.registerReturn(request, this.clock()),
    );
  }
}
