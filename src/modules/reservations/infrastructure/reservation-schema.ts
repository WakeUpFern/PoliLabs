import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "@/modules/identity/infrastructure/auth-schema";
import {
  spaces,
  resources,
} from "@/modules/spatial/infrastructure/spatial-schema";

export const reservations = pgTable(
  "reservations",
  {
    id: uuid("id")
      .default(sql`pg_catalog.gen_random_uuid()`)
      .primaryKey(),
    spaceId: uuid("space_id")
      .notNull()
      .references(() => spaces.id, { onDelete: "restrict" }),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    isExclusive: boolean("is_exclusive").notNull(),
    status: text("status")
      .$type<"confirmed" | "cancelled">()
      .default("confirmed")
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("reservations_id_space_unique_idx").on(table.id, table.spaceId),
    index("reservations_creator_idx").on(table.createdBy),
    index("reservations_space_interval_idx").on(
      table.spaceId,
      table.startsAt,
      table.endsAt,
    ),
    check(
      "reservations_interval_check",
      sql`isfinite(${table.startsAt}) and isfinite(${table.endsAt}) and ${table.startsAt} < ${table.endsAt}`,
    ),
    check(
      "reservations_status_check",
      sql`(${table.status} = 'confirmed' and ${table.cancelledAt} is null) or (${table.status} = 'cancelled' and ${table.cancelledAt} is not null)`,
    ),
  ],
);

export const reservationResources = pgTable(
  "reservation_resources",
  {
    reservationId: uuid("reservation_id").notNull(),
    spaceId: uuid("space_id").notNull(),
    resourceId: uuid("resource_id").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.reservationId, table.resourceId] }),
    index("reservation_resources_resource_idx").on(table.resourceId),
    foreignKey({
      name: "reservation_resources_reservation_space_fk",
      columns: [table.reservationId, table.spaceId],
      foreignColumns: [reservations.id, reservations.spaceId],
    }).onDelete("restrict"),
    foreignKey({
      name: "reservation_resources_resource_space_fk",
      columns: [table.resourceId, table.spaceId],
      foreignColumns: [resources.id, resources.spaceId],
    }).onDelete("restrict"),
  ],
);
