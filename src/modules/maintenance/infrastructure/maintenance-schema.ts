import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  timestamp,
  date,
  check,
  index,
  uniqueIndex,
  foreignKey,
} from "drizzle-orm/pg-core";
import { users } from "@/modules/identity/infrastructure/auth-schema";
import {
  spaces,
  resources,
} from "@/modules/spatial/infrastructure/spatial-schema";
import { incidentReports } from "@/modules/incidents/infrastructure/incident-schema";
import { inventoryMovements } from "@/modules/inventory/infrastructure/inventory-schema";
import type {
  MaintenanceType,
  MaintenanceSource,
  OperationalStatus,
} from "../domain/maintenance";
const statuses = sql.raw(`('operational','in_maintenance','out_of_service')`);
export const maintenanceLogs = pgTable(
  "maintenance_logs",
  {
    id: uuid("id")
      .default(sql`pg_catalog.gen_random_uuid()`)
      .primaryKey(),
    laboratoryId: uuid("laboratory_id").notNull(),
    spaceId: uuid("space_id").notNull(),
    resourceId: uuid("resource_id").notNull(),
    performedBy: uuid("performed_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    type: text("maintenance_type").$type<MaintenanceType>().notNull(),
    description: text("description").notNull(),
    // Filled by the insert trigger from the locked resource row.
    statusBefore: text("status_before").$type<OperationalStatus>().notNull(),
    statusAfter: text("status_after").$type<OperationalStatus>().notNull(),
    performedAt: timestamp("performed_at", { withTimezone: true }).notNull(),
    nextDueOn: date("next_maintenance_due"),
    incidentId: uuid("incident_id"),
    source: text("source").$type<MaintenanceSource>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("maintenance_logs_id_laboratory_idx").on(t.id, t.laboratoryId),
    index("maintenance_logs_resource_time_idx").on(t.resourceId, t.performedAt),
    index("maintenance_logs_laboratory_time_idx").on(
      t.laboratoryId,
      t.createdAt,
    ),
    index("maintenance_logs_incident_idx").on(t.incidentId),
    foreignKey({
      name: "maintenance_logs_space_laboratory_fk",
      columns: [t.spaceId, t.laboratoryId],
      foreignColumns: [spaces.id, spaces.laboratoryId],
    }).onDelete("restrict"),
    foreignKey({
      name: "maintenance_logs_resource_space_fk",
      columns: [t.resourceId, t.spaceId],
      foreignColumns: [resources.id, resources.spaceId],
    }).onDelete("restrict"),
    foreignKey({
      name: "maintenance_logs_incident_resource_fk",
      columns: [t.incidentId, t.resourceId],
      foreignColumns: [incidentReports.id, incidentReports.resourceId],
    }).onDelete("restrict"),
    check(
      "maintenance_logs_type_check",
      sql`${t.type} in ('preventive','corrective','inspection','other')`,
    ),
    check(
      "maintenance_logs_status_check",
      sql`${t.statusBefore} in ${statuses} and ${t.statusAfter} in ${statuses}`,
    ),
    check(
      "maintenance_logs_description_check",
      sql`length(btrim(${t.description})) between 1 and 5000`,
    ),
    check(
      "maintenance_logs_source_check",
      sql`${t.source} in ('WEB','API','AGENT','SYSTEM')`,
    ),
    check(
      "maintenance_logs_time_check",
      sql`isfinite(${t.performedAt}) and ${t.performedAt} <= ${t.createdAt} and (${t.nextDueOn} is null or (isfinite(${t.nextDueOn}) and ${t.nextDueOn} >= (${t.performedAt} at time zone 'UTC')::date))`,
    ),
  ],
);
export const maintenanceMaterials = pgTable(
  "maintenance_materials",
  {
    id: uuid("id")
      .default(sql`pg_catalog.gen_random_uuid()`)
      .primaryKey(),
    maintenanceLogId: uuid("maintenance_log_id").notNull(),
    laboratoryId: uuid("laboratory_id").notNull(),
    movementId: uuid("movement_id").notNull(),
  },
  (t) => [
    uniqueIndex("maintenance_materials_movement_idx").on(t.movementId),
    index("maintenance_materials_log_idx").on(t.maintenanceLogId),
    foreignKey({
      name: "maintenance_materials_log_laboratory_fk",
      columns: [t.maintenanceLogId, t.laboratoryId],
      foreignColumns: [maintenanceLogs.id, maintenanceLogs.laboratoryId],
    }).onDelete("restrict"),
    foreignKey({
      name: "maintenance_materials_movement_laboratory_fk",
      columns: [t.movementId, t.laboratoryId],
      foreignColumns: [inventoryMovements.id, inventoryMovements.laboratoryId],
    }).onDelete("restrict"),
  ],
);
