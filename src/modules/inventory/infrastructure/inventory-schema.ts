import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  numeric,
  jsonb,
  check,
  foreignKey,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { laboratories } from "@/modules/identity/infrastructure/access-schema";
import { users } from "@/modules/identity/infrastructure/auth-schema";
import { locations } from "@/modules/spatial/infrastructure/spatial-schema";
import type { ItemType, Unit, MovementType, Source } from "../domain/inventory";
const id = () =>
  uuid("id")
    .default(sql`pg_catalog.gen_random_uuid()`)
    .primaryKey();
const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).defaultNow().notNull();
export const inventoryItems = pgTable(
  "inventory_items",
  {
    id: id(),
    laboratoryId: uuid("laboratory_id")
      .notNull()
      .references(() => laboratories.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    type: text("type").$type<ItemType>().notNull(),
    unit: text("unit").$type<Unit>().notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("inventory_items_id_lab_idx").on(t.id, t.laboratoryId),
    index("inventory_items_lab_idx").on(t.laboratoryId),
    check(
      "inventory_item_name_check",
      sql`length(btrim(${t.name})) between 1 and 200`,
    ),
    check(
      "inventory_item_type_check",
      sql`${t.type} in ('consumable', 'reusable_tool')`,
    ),
    check(
      "inventory_item_unit_check",
      sql`${t.unit} in ('piece', 'metre', 'litre', 'kilogram') and (${t.type} <> 'reusable_tool' or ${t.unit} = 'piece')`,
    ),
  ],
);
export const inventoryStocks = pgTable(
  "inventory_stocks",
  {
    itemId: uuid("item_id")
      .primaryKey()
      .references(() => inventoryItems.id, { onDelete: "restrict" }),
    locationId: uuid("location_id").references(() => locations.id, {
      onDelete: "restrict",
    }),
    quantity: numeric("quantity", { precision: 18, scale: 3 })
      .default("0")
      .notNull(),
  },
  (t) => [
    index("inventory_stocks_location_idx").on(t.locationId),
    check(
      "inventory_stock_nonnegative_check",
      sql`${t.quantity} >= 0 and ${t.quantity} <> 'NaN'::numeric`,
    ),
  ],
);
export const inventoryMovements = pgTable(
  "inventory_movements",
  {
    id: id(),
    itemId: uuid("item_id").notNull(),
    laboratoryId: uuid("laboratory_id").notNull(),
    locationId: uuid("location_id").references(() => locations.id, {
      onDelete: "restrict",
    }),
    type: text("type").$type<MovementType>().notNull(),
    quantity: numeric("quantity", { precision: 18, scale: 3 }).notNull(),
    quantityBefore: numeric("quantity_before", {
      precision: 18,
      scale: 3,
    }).notNull(),
    quantityAfter: numeric("quantity_after", {
      precision: 18,
      scale: 3,
    }).notNull(),
    actorUserId: uuid("actor_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    source: text("source").$type<Source>().notNull(),
    notes: text("notes").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      name: "inventory_movement_item_lab_fk",
      columns: [t.itemId, t.laboratoryId],
      foreignColumns: [inventoryItems.id, inventoryItems.laboratoryId],
    }).onDelete("restrict"),
    index("inventory_movements_item_idx").on(t.itemId, t.createdAt),
    check(
      "inventory_movement_type_check",
      sql`${t.type} in ('initial','purchase','entry','consumption','damage','loss','adjustment_in','adjustment_out')`,
    ),
    check(
      "inventory_movement_quantity_check",
      sql`${t.quantity} > 0 and ${t.quantity} <> 'NaN'::numeric and ${t.quantityBefore} >= 0 and ${t.quantityAfter} >= 0 and ${t.quantityBefore} <> 'NaN'::numeric and ${t.quantityAfter} <> 'NaN'::numeric`,
    ),
    check(
      "inventory_movement_notes_check",
      sql`length(btrim(${t.notes})) between 1 and 1000`,
    ),
    check(
      "inventory_movement_source_check",
      sql`${t.source} in ('WEB','API','AGENT','SYSTEM')`,
    ),
  ],
);
export const inventoryEvents = pgTable(
  "inventory_events",
  {
    id: id(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => inventoryItems.id, { onDelete: "restrict" }),
    actorUserId: uuid("actor_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    action: text("action")
      .$type<"created" | "updated" | "deactivated">()
      .notNull(),
    source: text("source").$type<Source>().notNull(),
    snapshot: jsonb("snapshot").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index("inventory_events_item_idx").on(t.itemId),
    check(
      "inventory_event_action_check",
      sql`${t.action} in ('created','updated','deactivated')`,
    ),
    check(
      "inventory_event_source_check",
      sql`${t.source} in ('WEB','API','AGENT','SYSTEM')`,
    ),
  ],
);
