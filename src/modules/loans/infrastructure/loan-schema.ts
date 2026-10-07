import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  numeric,
  timestamp,
  check,
  index,
  uniqueIndex,
  foreignKey,
} from "drizzle-orm/pg-core";
import { users } from "@/modules/identity/infrastructure/auth-schema";
import { laboratoryMemberships } from "@/modules/identity/infrastructure/access-schema";
import { labSessions } from "@/modules/academic/infrastructure/academic-schema";
import {
  inventoryItems,
  inventoryMovements,
} from "@/modules/inventory/infrastructure/inventory-schema";
import type { LoanSource, LoanStatus, ReturnCondition } from "../domain/loans";
const quantity = (name: string) => numeric(name, { precision: 18, scale: 3 });
export const inventoryLoans = pgTable(
  "inventory_loans",
  {
    id: uuid("id")
      .default(sql`pg_catalog.gen_random_uuid()`)
      .primaryKey(),
    laboratoryId: uuid("laboratory_id").notNull(),
    itemId: uuid("item_id").notNull(),
    borrowerUserId: uuid("borrower_user_id").notNull(),
    sessionId: uuid("session_id"),
    quantity: quantity("quantity").notNull(),
    // Maintained only by the return trigger.
    returnedQuantity: quantity("returned_quantity").default("0").notNull(),
    status: text("status").$type<LoanStatus>().default("active").notNull(),
    loanedAt: timestamp("loaned_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    dueAt: timestamp("due_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    actorUserId: uuid("actor_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    source: text("source").$type<LoanSource>().notNull(),
    notes: text("notes"),
  },
  (t) => [
    uniqueIndex("inventory_loans_id_laboratory_idx").on(t.id, t.laboratoryId),
    index("inventory_loans_active_item_idx")
      .on(t.itemId)
      .where(sql`${t.status} = 'active'`),
    index("inventory_loans_laboratory_status_idx").on(
      t.laboratoryId,
      t.status,
      t.dueAt,
    ),
    index("inventory_loans_borrower_idx").on(t.borrowerUserId, t.laboratoryId),
    foreignKey({
      name: "inventory_loans_item_laboratory_fk",
      columns: [t.itemId, t.laboratoryId],
      foreignColumns: [inventoryItems.id, inventoryItems.laboratoryId],
    }).onDelete("restrict"),
    foreignKey({
      name: "inventory_loans_borrower_laboratory_fk",
      columns: [t.borrowerUserId, t.laboratoryId],
      foreignColumns: [
        laboratoryMemberships.userId,
        laboratoryMemberships.laboratoryId,
      ],
    }).onDelete("restrict"),
    foreignKey({
      name: "inventory_loans_session_laboratory_fk",
      columns: [t.sessionId, t.laboratoryId],
      foreignColumns: [labSessions.id, labSessions.laboratoryId],
    }).onDelete("restrict"),
    check(
      "inventory_loans_quantity_check",
      sql`${t.quantity} > 0 and ${t.quantity} = trunc(${t.quantity}) and ${t.returnedQuantity} >= 0 and ${t.returnedQuantity} <= ${t.quantity} and ${t.returnedQuantity} = trunc(${t.returnedQuantity})`,
    ),
    check(
      "inventory_loans_status_check",
      sql`(${t.status} = 'active' and ${t.returnedQuantity} < ${t.quantity} and ${t.closedAt} is null) or (${t.status} = 'returned' and ${t.returnedQuantity} = ${t.quantity} and ${t.closedAt} is not null)`,
    ),
    check(
      "inventory_loans_time_check",
      sql`isfinite(${t.loanedAt}) and (${t.dueAt} is null or (isfinite(${t.dueAt}) and ${t.dueAt} > ${t.loanedAt})) and (${t.closedAt} is null or ${t.closedAt} >= ${t.loanedAt})`,
    ),
    check(
      "inventory_loans_notes_check",
      sql`${t.notes} is null or length(btrim(${t.notes})) between 1 and 1000`,
    ),
    check(
      "inventory_loans_source_check",
      sql`${t.source} in ('WEB','API','AGENT','SYSTEM')`,
    ),
  ],
);
export const inventoryLoanReturns = pgTable(
  "inventory_loan_returns",
  {
    id: uuid("id")
      .default(sql`pg_catalog.gen_random_uuid()`)
      .primaryKey(),
    loanId: uuid("loan_id").notNull(),
    laboratoryId: uuid("laboratory_id").notNull(),
    quantity: quantity("quantity").notNull(),
    condition: text("condition").$type<ReturnCondition>().notNull(),
    notes: text("notes"),
    movementId: uuid("movement_id"),
    actorUserId: uuid("actor_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    source: text("source").$type<LoanSource>().notNull(),
    returnedAt: timestamp("returned_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("inventory_loan_returns_loan_idx").on(t.loanId),
    uniqueIndex("inventory_loan_returns_movement_idx").on(t.movementId),
    foreignKey({
      name: "inventory_loan_returns_loan_laboratory_fk",
      columns: [t.loanId, t.laboratoryId],
      foreignColumns: [inventoryLoans.id, inventoryLoans.laboratoryId],
    }).onDelete("restrict"),
    foreignKey({
      name: "inventory_loan_returns_movement_laboratory_fk",
      columns: [t.movementId, t.laboratoryId],
      foreignColumns: [inventoryMovements.id, inventoryMovements.laboratoryId],
    }).onDelete("restrict"),
    check(
      "inventory_loan_returns_quantity_check",
      sql`${t.quantity} > 0 and ${t.quantity} = trunc(${t.quantity})`,
    ),
    check(
      "inventory_loan_returns_condition_check",
      sql`(${t.condition} = 'good' and ${t.movementId} is null) or (${t.condition} in ('damaged','lost') and ${t.movementId} is not null and ${t.notes} is not null)`,
    ),
    check(
      "inventory_loan_returns_notes_check",
      sql`${t.notes} is null or length(btrim(${t.notes})) between 1 and 1000`,
    ),
    check(
      "inventory_loan_returns_source_check",
      sql`${t.source} in ('WEB','API','AGENT','SYSTEM')`,
    ),
  ],
);
