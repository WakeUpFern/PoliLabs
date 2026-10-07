import { and, asc, desc, eq, inArray, lte, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import {
  authorizeLocked,
  type OperationDatabase,
  type OperationTransaction,
} from "@/modules/identity/infrastructure/authorize-locked";
import type { PermissionKey } from "@/modules/identity/domain/access-catalog";
import { users } from "@/modules/identity/infrastructure/auth-schema";
import { laboratoryMemberships } from "@/modules/identity/infrastructure/access-schema";
import {
  labSessions,
  practices,
} from "@/modules/academic/infrastructure/academic-schema";
import {
  inventoryItems,
  inventoryStocks,
  inventoryMovements,
} from "@/modules/inventory/infrastructure/inventory-schema";
import {
  inventoryLoans as loans,
  inventoryLoanReturns as returns,
} from "./loan-schema";
import {
  assertAvailable,
  assertReturnable,
  availability,
  isOverdue,
  LoanError,
  loanId,
  outstanding,
  returnMovementType,
  type Loan,
  type LoanContext,
  type LoanFilter,
  type LoanRequest,
  type ReturnRequest,
} from "../domain/loans";
import type { LoanStore, LoanTransaction } from "../application/loan-store";
function postgresError(error: unknown): { code?: string; message?: string } {
  if (!error || typeof error !== "object") return {};
  if ("code" in error) return error as { code: string; message?: string };
  if ("cause" in error) return postgresError(error.cause);
  return {};
}
const borrowers = alias(users, "loan_borrowers");
const actors = alias(users, "loan_actors");
const returnActors = alias(users, "loan_return_actors");
const MAX_LISTED = 100;
const MAX_SESSIONS = 50;
const loanColumns = {
  id: loans.id,
  laboratoryId: loans.laboratoryId,
  itemId: loans.itemId,
  itemName: inventoryItems.name,
  borrowerUserId: loans.borrowerUserId,
  borrowerName: borrowers.name,
  quantity: loans.quantity,
  returnedQuantity: loans.returnedQuantity,
  status: loans.status,
  loanedAt: loans.loanedAt,
  dueAt: loans.dueAt,
  closedAt: loans.closedAt,
  sessionId: loans.sessionId,
  sessionLabel: practices.title,
  actorUserId: loans.actorUserId,
  actorName: actors.name,
  source: loans.source,
  notes: loans.notes,
};
class DrizzleLoanTransaction implements LoanTransaction {
  constructor(
    private readonly tx: OperationTransaction,
    private readonly context: LoanContext,
  ) {}
  private async loaned(itemId: string) {
    const [row] = await this.tx
      .select({
        value: sql<string>`coalesce(sum(${loans.quantity} - ${loans.returnedQuantity}), 0)::numeric(18,3)::text`,
      })
      .from(loans)
      .where(and(eq(loans.itemId, itemId), eq(loans.status, "active")));
    return row.value;
  }
  private async load(where: SQL | undefined, order: SQL[], now: Date) {
    const rows = await this.tx
      .select(loanColumns)
      .from(loans)
      .innerJoin(inventoryItems, eq(inventoryItems.id, loans.itemId))
      .innerJoin(borrowers, eq(borrowers.id, loans.borrowerUserId))
      .innerJoin(actors, eq(actors.id, loans.actorUserId))
      .leftJoin(labSessions, eq(labSessions.id, loans.sessionId))
      .leftJoin(practices, eq(practices.id, labSessions.practiceId))
      .where(and(eq(loans.laboratoryId, this.context.laboratoryId), where))
      .orderBy(...order, desc(loans.id))
      .limit(MAX_LISTED);
    const history = rows.length
      ? await this.tx
          .select({
            loanId: returns.loanId,
            id: returns.id,
            quantity: returns.quantity,
            condition: returns.condition,
            notes: returns.notes,
            movementId: returns.movementId,
            actorUserId: returns.actorUserId,
            actorName: returnActors.name,
            source: returns.source,
            returnedAt: returns.returnedAt,
          })
          .from(returns)
          .innerJoin(returnActors, eq(returnActors.id, returns.actorUserId))
          .where(
            inArray(
              returns.loanId,
              rows.map((r) => r.id),
            ),
          )
          .orderBy(asc(returns.returnedAt), asc(returns.id))
      : [];
    return rows.map((row): Loan => ({
      ...row,
      outstanding: outstanding(row),
      overdue: isOverdue(row, now),
      returns: history
        .filter((r) => r.loanId === row.id)
        .map(({ loanId: _loanId, ...r }) => {
          void _loanId;
          return r;
        }),
    }));
  }
  private async one(id: string, now: Date) {
    const [loan] = await this.load(eq(loans.id, id), [], now);
    if (!loan) throw new LoanError("not-found");
    return loan;
  }
  async summary(itemId: string) {
    const [item] = await this.tx
      .select({
        itemId: inventoryItems.id,
        itemType: inventoryItems.type,
        isActive: inventoryItems.isActive,
        stock: inventoryStocks.quantity,
      })
      .from(inventoryItems)
      .innerJoin(inventoryStocks, eq(inventoryStocks.itemId, inventoryItems.id))
      .where(
        and(
          eq(inventoryItems.id, itemId),
          eq(inventoryItems.laboratoryId, this.context.laboratoryId),
        ),
      );
    if (!item) throw new LoanError("not-found");
    const loaned = await this.loaned(itemId);
    return { ...item, loaned, available: availability(item.stock, loaned) };
  }
  itemLoans(itemId: string, now: Date) {
    // Active first, then the most recent closed loans of this item.
    return this.load(
      eq(loans.itemId, itemId),
      [asc(loans.status), desc(loans.loanedAt)],
      now,
    );
  }
  list(
    scope: { kind: "laboratory"; filter: LoanFilter } | { kind: "own" },
    now: Date,
  ) {
    if (scope.kind === "own")
      return this.load(
        eq(loans.borrowerUserId, this.context.actorUserId),
        [asc(loans.status), desc(loans.loanedAt)],
        now,
      );
    return this.load(
      and(
        eq(loans.status, "active"),
        scope.filter === "overdue" ? lte(loans.dueAt, now) : undefined,
      ),
      [sql`${loans.dueAt} asc nulls last`, asc(loans.loanedAt)],
      now,
    );
  }
  async options() {
    const members = await this.tx
      .select({ id: users.id, name: users.name })
      .from(users)
      .innerJoin(
        laboratoryMemberships,
        eq(laboratoryMemberships.userId, users.id),
      )
      .where(
        and(
          eq(laboratoryMemberships.laboratoryId, this.context.laboratoryId),
          eq(laboratoryMemberships.isActive, true),
          eq(users.isActive, true),
        ),
      )
      .orderBy(asc(users.name), asc(users.id));
    const sessions = await this.tx
      .select({
        id: labSessions.id,
        label: practices.title,
        startsAt: labSessions.startsAt,
      })
      .from(labSessions)
      .innerJoin(practices, eq(practices.id, labSessions.practiceId))
      .where(
        and(
          eq(labSessions.laboratoryId, this.context.laboratoryId),
          inArray(labSessions.status, ["scheduled", "open"]),
        ),
      )
      .orderBy(asc(labSessions.startsAt), asc(labSessions.id))
      .limit(MAX_SESSIONS);
    return { members, sessions };
  }
  private async lockItem(itemId: string) {
    const [item] = await this.tx
      .select()
      .from(inventoryItems)
      .where(
        and(
          eq(inventoryItems.id, itemId),
          eq(inventoryItems.laboratoryId, this.context.laboratoryId),
        ),
      )
      .for("update");
    if (!item) throw new LoanError("not-found");
    // Read balance and loans after the lock, in new statements.
    const [stock] = await this.tx
      .select()
      .from(inventoryStocks)
      .where(eq(inventoryStocks.itemId, item.id));
    return { item, stock, loaned: await this.loaned(item.id) };
  }
  async lend(request: LoanRequest, now: Date) {
    // Lock order: authorization -> session (SHARE) -> borrower (SHARE) -> item (UPDATE).
    if (request.sessionId) {
      const [session] = await this.tx
        .select({ status: labSessions.status })
        .from(labSessions)
        .where(
          and(
            eq(labSessions.id, request.sessionId),
            eq(labSessions.laboratoryId, this.context.laboratoryId),
          ),
        )
        .for("share");
      if (!session || !["scheduled", "open"].includes(session.status))
        throw new LoanError("session");
    }
    const [borrower] = await this.tx
      .select({ id: users.id })
      .from(users)
      .innerJoin(
        laboratoryMemberships,
        eq(laboratoryMemberships.userId, users.id),
      )
      .where(
        and(
          eq(users.id, request.borrowerUserId),
          eq(users.isActive, true),
          eq(laboratoryMemberships.laboratoryId, this.context.laboratoryId),
          eq(laboratoryMemberships.isActive, true),
        ),
      )
      .for("share");
    if (!borrower) throw new LoanError("borrower");
    const { item, stock, loaned } = await this.lockItem(request.itemId);
    if (!item.isActive || item.type !== "reusable_tool")
      throw new LoanError("tool");
    assertAvailable(stock.quantity, loaned, request.quantity);
    // The insert trigger revalidates relations and availability under the same locks.
    const [row] = await this.tx
      .insert(loans)
      .values({
        laboratoryId: this.context.laboratoryId,
        itemId: item.id,
        borrowerUserId: borrower.id,
        sessionId: request.sessionId,
        quantity: request.quantity,
        dueAt: request.dueAt,
        actorUserId: this.context.actorUserId,
        source: request.source,
        notes: request.notes,
      })
      .returning({ id: loans.id });
    return this.one(row.id, now);
  }
  async registerReturn(request: ReturnRequest, now: Date) {
    const movementType = returnMovementType(request.condition);
    // Damage or loss changes stock: revalidate inventory.adjust before data locks.
    if (movementType)
      await authorizeLocked(this.tx, this.context, "inventory.adjust");
    const [ref] = await this.tx
      .select({ itemId: loans.itemId })
      .from(loans)
      .where(
        and(
          eq(loans.id, request.loanId),
          eq(loans.laboratoryId, this.context.laboratoryId),
        ),
      );
    if (!ref) throw new LoanError("not-found");
    // Item before loan, matching new loans and inventory movements.
    const { item, stock } = await this.lockItem(ref.itemId);
    const [loan] = await this.tx
      .select()
      .from(loans)
      .where(eq(loans.id, request.loanId))
      .for("update");
    assertReturnable(loan, request.quantity);
    let movementId: string | null = null;
    if (movementType) {
      // The Inventory trigger owns balance arithmetic; the stock leaves with the tool.
      const [movement] = await this.tx
        .insert(inventoryMovements)
        .values({
          itemId: item.id,
          laboratoryId: this.context.laboratoryId,
          locationId: stock.locationId,
          type: movementType,
          quantity: request.quantity,
          quantityBefore: "0",
          quantityAfter: "0",
          actorUserId: this.context.actorUserId,
          source: request.source,
          notes: `Devolución de préstamo: ${request.notes}`.slice(0, 1000),
        })
        .returning({ id: inventoryMovements.id });
      movementId = movement.id;
    }
    await this.tx.insert(returns).values({
      loanId: loan.id,
      laboratoryId: this.context.laboratoryId,
      quantity: request.quantity,
      condition: request.condition,
      notes: request.notes,
      movementId,
      actorUserId: this.context.actorUserId,
      source: request.source,
    });
    return this.one(loan.id, now);
  }
}
export class DrizzleLoanStore implements LoanStore {
  constructor(private readonly db: OperationDatabase) {}
  async run<T>(
    context: LoanContext,
    permission: PermissionKey,
    operation: (
      tx: LoanTransaction,
      permissionKeys: readonly string[],
    ) => Promise<T>,
  ): Promise<T> {
    loanId(context.actorUserId);
    loanId(context.laboratoryId);
    try {
      return await this.db.transaction(
        async (tx) => {
          const grant = await authorizeLocked(tx, context, permission);
          return operation(
            new DrizzleLoanTransaction(tx, context),
            grant.permissionKeys,
          );
        },
        { isolationLevel: "read committed" },
      );
    } catch (error) {
      const pg = postgresError(error);
      const has = (value: string) => pg.message?.includes(value) ?? false;
      if (pg.code === "23503") {
        if (has("loan-session")) throw new LoanError("session");
        if (has("loan-borrower")) throw new LoanError("borrower");
        throw new LoanError("not-found");
      }
      if (pg.code === "23514") {
        if (has("loan-unavailable") || has("loaned-stock"))
          throw new LoanError("unavailable");
        if (has("loan-tool") || has("inactive")) throw new LoanError("tool");
        if (has("loan-closed")) throw new LoanError("closed");
        if (has("loan-excess-return")) throw new LoanError("excess-return");
        throw new LoanError("input");
      }
      throw error;
    }
  }
}
