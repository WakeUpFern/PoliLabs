import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  jsonb,
  check,
  index,
  foreignKey,
} from "drizzle-orm/pg-core";
import { users } from "@/modules/identity/infrastructure/auth-schema";
import {
  spaces,
  resources,
} from "@/modules/spatial/infrastructure/spatial-schema";
import { labSessions } from "@/modules/academic/infrastructure/academic-schema";
import { resourceUsage } from "@/modules/usage/infrastructure/usage-schema";
import type {
  IncidentTargetKind,
  IncidentSeverity,
  IncidentStatus,
  IncidentSource,
  IncidentTargetSnapshot,
} from "../domain/incidents";
export const incidentReports = pgTable(
  "incident_reports",
  {
    id: uuid("id")
      .default(sql`pg_catalog.gen_random_uuid()`)
      .primaryKey(),
    laboratoryId: uuid("laboratory_id").notNull(),
    targetKind: text("target_kind").$type<IncidentTargetKind>().notNull(),
    spaceId: uuid("space_id").notNull(),
    resourceId: uuid("resource_id"),
    sessionId: uuid("session_id"),
    usageId: uuid("usage_id"),
    reportedBy: uuid("reported_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    description: text("description").notNull(),
    severity: text("severity").$type<IncidentSeverity>().notNull(),
    status: text("status").$type<IncidentStatus>().default("open").notNull(),
    targetSnapshot: jsonb("target_snapshot")
      .$type<IncidentTargetSnapshot>()
      .notNull(),
    resolution: text("resolution"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    version: integer("version").default(1).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("incident_reports_laboratory_time_idx").on(
      t.laboratoryId,
      t.createdAt,
    ),
    index("incident_reports_reporter_idx").on(t.reportedBy, t.laboratoryId),
    index("incident_reports_resource_idx").on(t.resourceId),
    foreignKey({
      name: "incident_reports_space_laboratory_fk",
      columns: [t.spaceId, t.laboratoryId],
      foreignColumns: [spaces.id, spaces.laboratoryId],
    }).onDelete("restrict"),
    foreignKey({
      name: "incident_reports_resource_space_fk",
      columns: [t.resourceId, t.spaceId],
      foreignColumns: [resources.id, resources.spaceId],
    }).onDelete("restrict"),
    foreignKey({
      name: "incident_reports_session_space_fk",
      columns: [t.sessionId, t.spaceId],
      foreignColumns: [labSessions.id, labSessions.spaceId],
    }).onDelete("restrict"),
    foreignKey({
      name: "incident_reports_usage_resource_space_fk",
      columns: [t.usageId, t.resourceId, t.spaceId],
      foreignColumns: [
        resourceUsage.id,
        resourceUsage.resourceId,
        resourceUsage.spaceId,
      ],
    }).onDelete("restrict"),
    check(
      "incident_reports_target_check",
      sql`(${t.targetKind} = 'resource' and ${t.resourceId} is not null and ${t.sessionId} is null) or (${t.targetKind} = 'space' and ${t.resourceId} is null and ${t.sessionId} is null) or (${t.targetKind} = 'session' and ${t.resourceId} is null and ${t.sessionId} is not null)`,
    ),
    check(
      "incident_reports_usage_target_check",
      sql`${t.usageId} is null or ${t.resourceId} is not null`,
    ),
    check(
      "incident_reports_description_check",
      sql`length(btrim(${t.description})) between 1 and 5000`,
    ),
    check(
      "incident_reports_severity_check",
      sql`${t.severity} in ('low','medium','high')`,
    ),
    check(
      "incident_reports_status_check",
      sql`${t.status} in ('open','in_review','resolved')`,
    ),
    check("incident_reports_version_check", sql`${t.version} > 0`),
    check(
      "incident_reports_resolution_check",
      sql`(${t.status} = 'resolved' and ${t.resolution} is not null and length(btrim(${t.resolution})) between 1 and 5000 and ${t.resolvedAt} is not null and isfinite(${t.resolvedAt}) and ${t.resolvedAt} >= ${t.createdAt}) or (${t.status} <> 'resolved' and ${t.resolution} is null and ${t.resolvedAt} is null)`,
    ),
  ],
);
export const incidentEvents = pgTable(
  "incident_events",
  {
    id: uuid("id")
      .default(sql`pg_catalog.gen_random_uuid()`)
      .primaryKey(),
    incidentId: uuid("incident_id")
      .notNull()
      .references(() => incidentReports.id, { onDelete: "restrict" }),
    actorUserId: uuid("actor_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    source: text("source").$type<IncidentSource>().notNull(),
    action: text("action").notNull(),
    note: text("note").notNull(),
    snapshot: jsonb("snapshot").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("incident_events_incident_time_idx").on(t.incidentId, t.createdAt),
    check(
      "incident_events_source_check",
      sql`${t.source} in ('WEB','API','AGENT','SYSTEM')`,
    ),
    check(
      "incident_events_note_check",
      sql`length(btrim(${t.note})) between 1 and 5000`,
    ),
  ],
);
