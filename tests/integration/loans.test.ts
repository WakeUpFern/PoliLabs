import { test } from "node:test";
import assert from "node:assert/strict";
import { LoanService } from "../../src/modules/loans/application/loans";
import { DrizzleLoanStore } from "../../src/modules/loans/infrastructure/loan-store";
import { LoanError } from "../../src/modules/loans/domain/loans";
import {
  CreateInventoryItem,
  DeactivateInventoryItem,
  RecordInventoryMovement,
} from "../../src/modules/inventory/application/inventory";
import { DrizzleInventoryStore } from "../../src/modules/inventory/infrastructure/inventory-store";
import { InventoryError } from "../../src/modules/inventory/domain/inventory";
import { AuthorizationDeniedError } from "../../src/modules/identity/domain/access-errors";
import {
  operationFixture,
  pgCode,
  and,
  eq,
  inArray,
} from "./operation-fixture";

const rejected = (code: string) => (error: unknown) =>
  error instanceof LoanError && error.code === code;
const inventoryRejected = (code: string) => (error: unknown) =>
  error instanceof InventoryError && error.code === code;

test("Loans I lends and returns reusable tools in PostgreSQL", async (t) => {
  const f = await operationFixture();
  const { db, schema, pool, actor, student, userIds, labIds } = f;
  const store = new DrizzleLoanStore(db);
  const service = new LoanService(store);
  const inventoryStore = new DrizzleInventoryStore(db);
  const create = new CreateInventoryItem(inventoryStore);
  const move = new RecordInventoryMovement(inventoryStore);
  const deactivate = new DeactivateInventoryItem(inventoryStore);
  const tool = (quantity: string, laboratoryId = actor.laboratoryId) =>
    create.execute({
      ...actor,
      laboratoryId,
      name: "Pinzas",
      type: "reusable_tool",
      unit: "piece",
      initialQuantity: quantity,
      notes: "Existencia sintética",
    });
  const lend = (itemId: string, overrides: Record<string, unknown> = {}) =>
    service.lend({
      ...actor,
      itemId,
      borrowerUserId: userIds[1],
      quantity: "1",
      ...overrides,
    });
  const giveBack = (loanId: string, overrides: Record<string, unknown> = {}) =>
    service.registerReturn({
      ...actor,
      loanId,
      quantity: "1",
      condition: "good",
      ...overrides,
    });
  const summary = async (itemId: string) =>
    (await service.itemLoans({ ...actor, itemId })).summary;
  // Grants permissions to the limited fixture role for the duration of `run`.
  async function granting<T>(keys: string[], run: () => Promise<T>) {
    const granted = await db
      .select()
      .from(schema.permissions)
      .where(inArray(schema.permissions.key, keys));
    await db
      .insert(schema.rolePermissions)
      .values(
        granted.map((p) => ({ roleId: f.roleIds[1], permissionId: p.id })),
      );
    try {
      return await run();
    } finally {
      await db.delete(schema.rolePermissions).where(
        and(
          eq(schema.rolePermissions.roleId, f.roleIds[1]),
          inArray(
            schema.rolePermissions.permissionId,
            granted.map((p) => p.id),
          ),
        ),
      );
    }
  }
  try {
    await t.test(
      "a loan keeps stock, reduces availability and closes after partial returns",
      async () => {
        const pliers = await tool("5");
        const dueAt = new Date(Date.now() + 86400000).toISOString();
        const loan = await lend(pliers.id, {
          quantity: "3",
          dueAt,
          notes: "Práctica de torno",
        });
        assert.equal(loan.status, "active");
        assert.equal(loan.quantity, "3.000");
        assert.equal(loan.outstanding, "3.000");
        assert.equal(loan.borrowerUserId, userIds[1]);
        assert.equal(loan.actorUserId, actor.actorUserId);
        assert.equal(loan.source, "WEB");
        assert.equal(loan.dueAt?.toISOString(), dueAt);
        assert.equal(loan.overdue, false);
        // RB4: lending is not consumption; stock and ledger stay untouched.
        assert.deepEqual(await summary(pliers.id), {
          itemId: pliers.id,
          itemType: "reusable_tool",
          isActive: true,
          stock: "5.000",
          loaned: "3.000",
          available: "2.000",
        });
        assert.equal(
          (
            await db
              .select()
              .from(schema.inventoryMovements)
              .where(eq(schema.inventoryMovements.itemId, pliers.id))
          ).length,
          1,
        );
        const partial = await giveBack(loan.id, { quantity: "2" });
        assert.equal(partial.status, "active");
        assert.equal(partial.outstanding, "1.000");
        assert.equal(partial.returns.length, 1);
        assert.equal(partial.returns[0].actorUserId, actor.actorUserId);
        assert.equal((await summary(pliers.id)).available, "4.000");
        await assert.rejects(
          giveBack(loan.id, { quantity: "2" }),
          rejected("excess-return"),
        );
        const closed = await giveBack(loan.id);
        assert.equal(closed.status, "returned");
        assert.ok(closed.closedAt);
        assert.equal(closed.returns.length, 2);
        await assert.rejects(giveBack(loan.id), rejected("closed"));
        assert.equal((await summary(pliers.id)).available, "5.000");
      },
    );
    await t.test(
      "availability, tool type and quantities are enforced",
      async () => {
        const pliers = await tool("2");
        await assert.rejects(
          lend(pliers.id, { quantity: "3" }),
          rejected("unavailable"),
        );
        await assert.rejects(
          lend(pliers.id, { quantity: "1.5" }),
          rejected("input"),
        );
        await assert.rejects(
          lend(pliers.id, { quantity: "0" }),
          rejected("input"),
        );
        const oil = await create.execute({
          ...actor,
          name: "Aceite",
          type: "consumable",
          unit: "piece",
          initialQuantity: "4",
          notes: "Existencia sintética",
        });
        await assert.rejects(lend(oil.id), rejected("tool"));
        const foreign = await tool("2", labIds[1]);
        await assert.rejects(lend(foreign.id), rejected("not-found"));
        await assert.rejects(
          lend(pliers.id, {
            dueAt: new Date(Date.now() - 60000).toISOString(),
          }),
          rejected("input"),
        );
        // PostgreSQL rejects consumables even if the service is bypassed.
        await assert.rejects(
          db.insert(schema.inventoryLoans).values({
            laboratoryId: actor.laboratoryId,
            itemId: oil.id,
            borrowerUserId: userIds[1],
            quantity: "1",
            actorUserId: actor.actorUserId,
            source: "SYSTEM",
          }),
          (e) => pgCode(e) === "23514",
        );
      },
    );
    await t.test(
      "borrowers are active laboratory members, including oneself",
      async () => {
        const pliers = await tool("3");
        const own = await lend(pliers.id, {
          borrowerUserId: actor.actorUserId,
        });
        assert.equal(own.borrowerUserId, actor.actorUserId);
        const membership = f.members.find(
          (m) => m.userId === userIds[2] && m.laboratoryId === labIds[0],
        )!;
        await db
          .update(schema.laboratoryMemberships)
          .set({ isActive: false })
          .where(eq(schema.laboratoryMemberships.id, membership.id));
        try {
          await assert.rejects(
            lend(pliers.id, { borrowerUserId: userIds[2] }),
            rejected("borrower"),
          );
          const options = await service.options(actor);
          assert.ok(!options.members.some((m) => m.id === userIds[2]));
          assert.ok(options.members.some((m) => m.id === userIds[1]));
        } finally {
          await db
            .update(schema.laboratoryMemberships)
            .set({ isActive: true })
            .where(eq(schema.laboratoryMemberships.id, membership.id));
        }
        await assert.rejects(
          lend(pliers.id, {
            borrowerUserId: "00000000-0000-4000-8000-000000000000",
          }),
          rejected("borrower"),
        );
      },
    );
    await t.test(
      "an optional academic session must be scheduled or open in the laboratory",
      async () => {
        const pliers = await tool("3");
        const session = await f.session();
        const loan = await lend(pliers.id, { sessionId: session.id });
        assert.equal(loan.sessionId, session.id);
        assert.equal(loan.sessionLabel, "Practice");
        assert.ok(
          (await service.options(actor)).sessions.some(
            (s) => s.id === session.id,
          ),
        );
        await f.academic.changeSessionStatus({
          ...actor,
          sessionId: session.id,
          status: "cancelled",
        });
        await assert.rejects(
          lend(pliers.id, { sessionId: session.id }),
          rejected("session"),
        );
        await assert.rejects(
          lend(pliers.id, {
            sessionId: "00000000-0000-4000-8000-000000000000",
          }),
          rejected("session"),
        );
      },
    );
    await t.test(
      "permissions separate lending, own loans and totals",
      async () => {
        const pliers = await tool("4");
        const loan = await lend(pliers.id);
        await assert.rejects(
          service.lend({
            ...student,
            itemId: pliers.id,
            borrowerUserId: userIds[1],
            quantity: "1",
          }),
          AuthorizationDeniedError,
        );
        await assert.rejects(
          service.ownLoans(student),
          AuthorizationDeniedError,
        );
        await assert.rejects(
          service.laboratoryLoans(student),
          AuthorizationDeniedError,
        );
        await granting(["inventory.loan.read", "inventory.read"], async () => {
          const own = await service.ownLoans(student);
          assert.ok(own.some((l) => l.id === loan.id));
          assert.ok(own.every((l) => l.borrowerUserId === student.actorUserId));
          const forReader = await service.itemLoans({
            ...student,
            itemId: pliers.id,
          });
          assert.equal(forReader.summary.loaned, "1.000");
          // inventory.read shows totals without borrower identities.
          assert.equal(forReader.loans, null);
          await assert.rejects(
            service.laboratoryLoans(student),
            AuthorizationDeniedError,
          );
        });
        const access = await service.access(actor);
        assert.deepEqual(access, {
          canManage: true,
          canReadOwn: true,
          canAdjust: true,
          canReadInventory: true,
        });
      },
    );
    await t.test(
      "damaged or lost returns record a linked movement and require inventory.adjust",
      async () => {
        const pliers = await tool("4");
        const loan = await lend(pliers.id, { quantity: "3" });
        await assert.rejects(
          giveBack(loan.id, { condition: "damaged" }),
          rejected("input"),
        );
        const damaged = await giveBack(loan.id, {
          condition: "damaged",
          notes: "Punta rota",
        });
        const [movement] = await db
          .select()
          .from(schema.inventoryMovements)
          .where(
            eq(schema.inventoryMovements.id, damaged.returns[0].movementId!),
          );
        assert.equal(movement.type, "damage");
        assert.equal(movement.quantity, "1.000");
        assert.equal(movement.quantityAfter, "3.000");
        assert.equal(movement.actorUserId, actor.actorUserId);
        const lost = await giveBack(loan.id, {
          condition: "lost",
          notes: "No regresó",
        });
        assert.equal(lost.returns[1].condition, "lost");
        const after = await summary(pliers.id);
        assert.deepEqual(
          [after.stock, after.loaned, after.available],
          ["2.000", "1.000", "1.000"],
        );
        await granting(["inventory.loan"], async () => {
          await assert.rejects(
            giveBack(loan.id, {
              ...student,
              condition: "lost",
              notes: "Extraviada",
            }),
            AuthorizationDeniedError,
          );
          assert.equal((await summary(pliers.id)).stock, "2.000");
          const good = await giveBack(loan.id, { ...student });
          assert.equal(good.status, "returned");
          assert.equal(good.returns[2].actorUserId, student.actorUserId);
        });
      },
    );
    await t.test(
      "stock cannot fall below loaned units through movements or deactivation",
      async () => {
        const pliers = await tool("3");
        await lend(pliers.id, { quantity: "2" });
        const out = (quantity: string, type = "adjustment_out") =>
          move.execute({
            ...actor,
            itemId: pliers.id,
            type,
            quantity,
            notes: "Salida",
            source: "WEB",
          });
        await assert.rejects(out("2"), inventoryRejected("loaned-stock"));
        await assert.rejects(
          out("2", "loss"),
          inventoryRejected("loaned-stock"),
        );
        assert.equal((await summary(pliers.id)).stock, "3.000");
        await out("1");
        assert.equal((await summary(pliers.id)).available, "0.000");
        await assert.rejects(
          deactivate.execute({ ...actor, itemId: pliers.id, source: "WEB" }),
          inventoryRejected("has-stock"),
        );
      },
    );
    await t.test("loan history is protected in PostgreSQL", async () => {
      const pliers = await tool("2");
      const loan = await lend(pliers.id);
      await giveBack(loan.id);
      await assert.rejects(
        db
          .update(schema.inventoryLoans)
          .set({ dueAt: new Date(Date.now() + 3600000) })
          .where(eq(schema.inventoryLoans.id, loan.id)),
        (e) => pgCode(e) === "23514",
      );
      await assert.rejects(
        db
          .update(schema.inventoryLoanReturns)
          .set({ notes: "Reescrito" })
          .where(eq(schema.inventoryLoanReturns.loanId, loan.id)),
        (e) => pgCode(e) === "23514",
      );
      await assert.rejects(
        db.transaction(async (tx) => {
          await tx
            .delete(schema.inventoryLoanReturns)
            .where(eq(schema.inventoryLoanReturns.loanId, loan.id));
          await tx
            .delete(schema.inventoryLoans)
            .where(eq(schema.inventoryLoans.id, loan.id));
        }),
        (e) => pgCode(e) === "23514",
      );
      // A damage return must reference a matching movement.
      const active = await lend(pliers.id);
      await assert.rejects(
        db.insert(schema.inventoryLoanReturns).values({
          loanId: active.id,
          laboratoryId: actor.laboratoryId,
          quantity: "1",
          condition: "damaged",
          notes: "Sin movimiento propio",
          movementId: (
            await db
              .select({ id: schema.inventoryMovements.id })
              .from(schema.inventoryMovements)
              .where(eq(schema.inventoryMovements.itemId, pliers.id))
          )[0].id,
          actorUserId: actor.actorUserId,
          source: "SYSTEM",
        }),
        (e) => pgCode(e) === "23514",
      );
    });
    await t.test("overdue loans are computed when listing", async () => {
      const pliers = await tool("2");
      const due = await lend(pliers.id, {
        dueAt: new Date(Date.now() + 3600000).toISOString(),
      });
      const open = await lend(pliers.id);
      const later = new LoanService(
        store,
        () => new Date(Date.now() + 7200000),
      );
      const overdue = await later.laboratoryLoans({
        ...actor,
        filter: "overdue",
      });
      assert.ok(overdue.some((l) => l.id === due.id && l.overdue));
      assert.ok(!overdue.some((l) => l.id === open.id));
      const active = await service.laboratoryLoans(actor);
      assert.ok(active.some((l) => l.id === due.id && !l.overdue));
      assert.ok(active.some((l) => l.id === open.id));
      await assert.rejects(
        service.laboratoryLoans({ ...actor, filter: "late" }),
        rejected("input"),
      );
    });
    await t.test("concurrent loans cannot exceed availability", async () => {
      const pliers = await tool("3");
      const results = await Promise.allSettled([
        lend(pliers.id, { quantity: "2" }),
        lend(pliers.id, { quantity: "2" }),
      ]);
      assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
      const failure = results.find((r) => r.status === "rejected");
      assert.ok(
        failure?.status === "rejected" &&
          rejected("unavailable")(failure.reason),
      );
      assert.equal((await summary(pliers.id)).loaned, "2.000");
    });
    await t.test(
      "a return committed while a loan waits frees the unit for it",
      async () => {
        const pliers = await tool("2");
        const loan = await lend(pliers.id, { quantity: "2" });
        const client = await pool.connect();
        try {
          await client.query("begin isolation level read committed");
          await client.query(
            `insert into inventory_loan_returns (loan_id, laboratory_id, quantity, condition, actor_user_id, source)
             values ($1, $2, 1, 'good', $3, 'SYSTEM')`,
            [loan.id, actor.laboratoryId, actor.actorUserId],
          );
          const pending = lend(pliers.id).then(
            (value) => value,
            (error: unknown) => error,
          );
          await new Promise((resolve) => setTimeout(resolve, 300));
          await client.query("commit");
          const outcome = await pending;
          assert.ok(!(outcome instanceof Error), String(outcome));
        } finally {
          client.release();
        }
        assert.deepEqual(
          [
            (await summary(pliers.id)).loaned,
            (await summary(pliers.id)).available,
          ],
          ["2.000", "0.000"],
        );
      },
    );
    await t.test(
      "a return racing a new loan serializes on the item",
      async () => {
        const pliers = await tool("1");
        const loan = await lend(pliers.id);
        const results = await Promise.allSettled([
          giveBack(loan.id),
          lend(pliers.id),
        ]);
        assert.equal(results[0].status, "fulfilled");
        // The new loan succeeds only if it was serialized after the return.
        const final = await summary(pliers.id);
        assert.equal(
          final.loaned,
          results[1].status === "fulfilled" ? "1.000" : "0.000",
        );
        if (results[1].status === "rejected")
          assert.ok(rejected("unavailable")(results[1].reason));
      },
    );
    await t.test(
      "an inventory outflow and a loan cannot jointly overdraw stock",
      async () => {
        const pliers = await tool("3");
        await lend(pliers.id);
        const results = await Promise.allSettled([
          lend(pliers.id, { quantity: "2" }),
          move.execute({
            ...actor,
            itemId: pliers.id,
            type: "adjustment_out",
            quantity: "2",
            notes: "Baja simultánea",
            source: "WEB",
          }),
        ]);
        assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
        const failure = results.find((r) => r.status === "rejected");
        assert.ok(
          failure?.status === "rejected" &&
            (rejected("unavailable")(failure.reason) ||
              inventoryRejected("loaned-stock")(failure.reason)),
        );
        const final = await summary(pliers.id);
        assert.ok(Number(final.stock) >= Number(final.loaned));
      },
    );
    await t.test(
      "an outflow committed while a loan waits is seen by the loan",
      async () => {
        const pliers = await tool("2");
        const client = await pool.connect();
        try {
          await client.query("begin isolation level read committed");
          await client.query(
            `insert into inventory_movements (item_id, laboratory_id, type, quantity, quantity_before, quantity_after, actor_user_id, source, notes)
             values ($1, $2, 'loss', 2, 0, 0, $3, 'SYSTEM', 'Pérdida sintética')`,
            [pliers.id, actor.laboratoryId, actor.actorUserId],
          );
          const pending = lend(pliers.id).then(
            () => "created",
            (error: unknown) => error,
          );
          await new Promise((resolve) => setTimeout(resolve, 300));
          await client.query("commit");
          assert.ok(rejected("unavailable")(await pending));
        } finally {
          client.release();
        }
        assert.equal((await summary(pliers.id)).loaned, "0.000");
      },
    );
  } finally {
    await f.cleanup();
  }
});
