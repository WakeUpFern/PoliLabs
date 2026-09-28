import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { laboratories } from "@/modules/identity/infrastructure/access-schema";

export const spaces = pgTable(
  "spaces",
  {
    id: uuid("id")
      .default(sql`pg_catalog.gen_random_uuid()`)
      .primaryKey(),
    laboratoryId: uuid("laboratory_id")
      .notNull()
      .references(() => laboratories.id, { onDelete: "restrict" }),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    capacity: integer("capacity"),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("spaces_laboratory_slug_unique_idx").on(
      table.laboratoryId,
      table.slug,
    ),
    index("spaces_laboratory_idx").on(table.laboratoryId),
    check(
      "spaces_slug_format_check",
      sql`${table.slug} ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'`,
    ),
    check(
      "spaces_capacity_positive_check",
      sql`${table.capacity} is null or ${table.capacity} > 0`,
    ),
    check("spaces_name_not_blank_check", sql`btrim(${table.name}) <> ''`),
  ],
);
