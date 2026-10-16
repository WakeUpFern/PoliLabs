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
import type { OperationalStatus } from "../domain/resource";

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
    operationalStatus: text("operational_status")
      .$type<OperationalStatus>()
      .default("operational")
      .notNull(),
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
    check(
      "resources_operational_status_check",
      sql`${table.operationalStatus} in ('operational','in_maintenance','out_of_service')`,
    ),
  ],
);

// Spatial III (ADR 0020): plans are configuration of one Space. Every element
// repeats space_id so composite FKs keep plan, resource and location in the
// same Space even through direct SQL.
export const floorPlans = pgTable(
  "floor_plans",
  {
    id: uuid("id")
      .default(sql`pg_catalog.gen_random_uuid()`)
      .primaryKey(),
    spaceId: uuid("space_id")
      .notNull()
      .references(() => spaces.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    ...spatialTimestamps(),
  },
  (table) => [
    uniqueIndex("floor_plans_id_space_unique_idx").on(table.id, table.spaceId),
    index("floor_plans_space_idx").on(table.spaceId),
    check(
      "floor_plans_name_check",
      sql`btrim(${table.name}) <> '' and char_length(${table.name}) <= 120`,
    ),
    check(
      "floor_plans_size_check",
      sql`${table.width} between 1 and 100 and ${table.height} between 1 and 100`,
    ),
  ],
);

export const floorPlanElements = pgTable(
  "floor_plan_elements",
  {
    id: uuid("id")
      .default(sql`pg_catalog.gen_random_uuid()`)
      .primaryKey(),
    floorPlanId: uuid("floor_plan_id").notNull(),
    spaceId: uuid("space_id").notNull(),
    kind: text("kind").$type<"resource" | "location" | "label">().notNull(),
    resourceId: uuid("resource_id"),
    locationId: uuid("location_id"),
    label: text("label"),
    x: integer("x").notNull(),
    y: integer("y").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    ...spatialTimestamps(),
  },
  (table) => [
    index("floor_plan_elements_plan_idx").on(table.floorPlanId),
    uniqueIndex("floor_plan_elements_plan_resource_unique_idx")
      .on(table.floorPlanId, table.resourceId)
      .where(sql`${table.resourceId} is not null`),
    uniqueIndex("floor_plan_elements_plan_location_unique_idx")
      .on(table.floorPlanId, table.locationId)
      .where(sql`${table.locationId} is not null`),
    index("floor_plan_elements_resource_idx").on(table.resourceId),
    index("floor_plan_elements_location_idx").on(table.locationId),
    foreignKey({
      name: "floor_plan_elements_plan_same_space_fk",
      columns: [table.floorPlanId, table.spaceId],
      foreignColumns: [floorPlans.id, floorPlans.spaceId],
    }).onDelete("restrict"),
    foreignKey({
      name: "floor_plan_elements_resource_same_space_fk",
      columns: [table.resourceId, table.spaceId],
      foreignColumns: [resources.id, resources.spaceId],
    }).onDelete("restrict"),
    foreignKey({
      name: "floor_plan_elements_location_same_space_fk",
      columns: [table.locationId, table.spaceId],
      foreignColumns: [locations.id, locations.spaceId],
    }).onDelete("restrict"),
    check(
      "floor_plan_elements_target_check",
      sql`(${table.kind} = 'resource' and ${table.resourceId} is not null and ${table.locationId} is null and ${table.label} is null)
        or (${table.kind} = 'location' and ${table.locationId} is not null and ${table.resourceId} is null and ${table.label} is null)
        or (${table.kind} = 'label' and ${table.resourceId} is null and ${table.locationId} is null and btrim(${table.label}) <> '' and char_length(${table.label}) <= 80)`,
    ),
    check(
      "floor_plan_elements_box_check",
      sql`${table.x} >= 0 and ${table.y} >= 0 and ${table.width} >= 1 and ${table.height} >= 1`,
    ),
  ],
);
