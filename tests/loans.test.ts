import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assertAvailable,
  assertReturnable,
  availability,
  dueAt,
  isOverdue,
  LoanError,
  loanFilter,
  loanNotes,
  loanQuantity,
  loanSource,
  outstanding,
  returnCondition,
  returnMovementType,
} from "../src/modules/loans/domain/loans";
import { LoanService } from "../src/modules/loans/application/loans";
import type { LoanStore } from "../src/modules/loans/application/loan-store";
const id = "11111111-1111-1111-1111-111111111111";
const other = "22222222-2222-2222-2222-222222222222";
const now = new Date("2026-10-07T18:00:00Z");
const rejected = (code: string) => (error: unknown) =>
  error instanceof LoanError && error.code === code;
test("loan quantities are whole positive pieces with exact arithmetic", () => {
  assert.equal(loanQuantity("3"), "3.000");
  assert.equal(loanQuantity(" 12 "), "12.000");
  for (const value of ["0", "1.5", "-1", "1e3", "abc", ""])
    assert.throws(() => loanQuantity(value), rejected("input"));
});
test("availability subtracts outstanding loans without consuming stock", () => {
  assert.equal(availability("5.000", "3.000"), "2.000");
  assert.equal(availability("2.000", "2.000"), "0.000");
  assert.equal(
    outstanding({ quantity: "3.000", returnedQuantity: "1.000" }),
    "2.000",
  );
  assertAvailable("5.000", "3.000", "2.000");
  assert.throws(
    () => assertAvailable("5.000", "3.000", "3.000"),
    rejected("unavailable"),
  );
});
test("returns are bounded by outstanding units of active loans", () => {
  const loan = {
    status: "active" as const,
    quantity: "3.000",
    returnedQuantity: "1.000",
  };
  assertReturnable(loan, "2.000");
  assert.throws(
    () => assertReturnable(loan, "3.000"),
    rejected("excess-return"),
  );
  assert.throws(
    () => assertReturnable({ ...loan, status: "returned" }, "1.000"),
    rejected("closed"),
  );
});
test("damage and loss map to stock-reducing movements", () => {
  assert.equal(returnMovementType("good"), null);
  assert.equal(returnMovementType("damaged"), "damage");
  assert.equal(returnMovementType("lost"), "loss");
  assert.equal(returnCondition("lost"), "lost");
  assert.throws(() => returnCondition("broken"), rejected("input"));
});
test("commitment dates need an offset and must be in the future", () => {
  assert.equal(dueAt(null, now), null);
  assert.equal(
    dueAt("2026-10-08T12:00:00-06:00", now)?.toISOString(),
    "2026-10-08T18:00:00.000Z",
  );
  for (const value of ["2026-10-08T12:00", "2026-10-07T18:00:00Z", "nope"])
    assert.throws(() => dueAt(value, now), rejected("input"));
});
test("overdue is derived from active loans with a past commitment", () => {
  const due = new Date("2026-10-07T17:00:00Z");
  assert.equal(isOverdue({ status: "active", dueAt: due }, now), true);
  assert.equal(isOverdue({ status: "returned", dueAt: due }, now), false);
  assert.equal(isOverdue({ status: "active", dueAt: null }, now), false);
  assert.equal(
    isOverdue(
      { status: "active", dueAt: new Date("2026-10-08T00:00:00Z") },
      now,
    ),
    false,
  );
});
test("notes, filters and sources are bounded", () => {
  assert.equal(loanNotes("  "), null);
  assert.equal(loanNotes(" ok "), "ok");
  assert.throws(() => loanNotes("", true), rejected("input"));
  assert.throws(() => loanNotes("x".repeat(1001)), rejected("input"));
  assert.equal(loanFilter(undefined), "active");
  assert.equal(loanFilter("overdue"), "overdue");
  assert.throws(() => loanFilter("late"), rejected("input"));
  assert.throws(() => loanSource("CLIENT"), rejected("input"));
});
test("the service rejects invalid requests before opening a transaction", async () => {
  let calls = 0;
  const store: LoanStore = {
    run: async () => {
      calls += 1;
      throw new Error("unexpected");
    },
  };
  const service = new LoanService(store, () => now);
  const context = { actorUserId: id, laboratoryId: other };
  await assert.rejects(
    service.lend({
      ...context,
      itemId: id,
      borrowerUserId: "not-a-uuid",
      quantity: "1",
      source: "WEB",
    }),
    rejected("input"),
  );
  await assert.rejects(
    service.lend({
      ...context,
      itemId: id,
      borrowerUserId: other,
      quantity: "1",
      dueAt: "2026-10-07T17:00:00Z",
      source: "WEB",
    }),
    rejected("input"),
  );
  await assert.rejects(
    service.registerReturn({
      ...context,
      loanId: id,
      quantity: "1",
      condition: "damaged",
      source: "WEB",
    }),
    rejected("input"),
  );
  await assert.rejects(
    service.laboratoryLoans({ ...context, filter: "late" }),
    rejected("input"),
  );
  assert.equal(calls, 0);
});
