import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
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
    uniqueIndex("spaces_id_laboratory_unique_idx").on(
      table.id,
      table.laboratoryId,
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

const spatialTimestamps = () => ({
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

export const locations = pgTable(
  "locations",
  {
    id: uuid("id")
      .default(sql`pg_catalog.gen_random_uuid()`)
      .primaryKey(),
    spaceId: uuid("space_id")
      .notNull()
      .references(() => spaces.id, { onDelete: "restrict" }),
    parentId: uuid("parent_id"),
    name: text("name").notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    ...spatialTimestamps(),
  },
  (table) => [
    uniqueIndex("locations_id_space_unique_idx").on(table.id, table.spaceId),
    index("locations_space_idx").on(table.spaceId),
    index("locations_parent_idx").on(table.parentId),
    foreignKey({
      name: "locations_parent_same_space_fk",
      columns: [table.parentId, table.spaceId],
      foreignColumns: [table.id, table.spaceId],
    }).onDelete("restrict"),
    check(
      "locations_not_own_parent_check",
      sql`${table.parentId} is null or ${table.parentId} <> ${table.id}`,
    ),
    check("locations_name_not_blank_check", sql`btrim(${table.name}) <> ''`),
  ],
);

export const resources = pgTable(
  "resources",
  {
    id: uuid("id")
      .default(sql`pg_catalog.gen_random_uuid()`)
      .primaryKey(),
    spaceId: uuid("space_id")
      .notNull()
      .references(() => spaces.id, { onDelete: "restrict" }),
    locationId: uuid("location_id"),
    name: text("name").notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    ...spatialTimestamps(),
  },
  (table) => [
    uniqueIndex("resources_id_space_unique_idx").on(table.id, table.spaceId),
    index("resources_space_idx").on(table.spaceId),
    index("resources_location_idx").on(table.locationId),
    foreignKey({
      name: "resources_location_same_space_fk",
      columns: [table.locationId, table.spaceId],
      foreignColumns: [locations.id, locations.spaceId],
    }).onDelete("restrict"),
    check("resources_name_not_blank_check", sql`btrim(${table.name}) <> ''`),
  ],
);
