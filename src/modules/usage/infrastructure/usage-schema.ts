import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  timestamp,
  text,
  jsonb,
  uniqueIndex,
  index,
  check,
  foreignKey,
} from "drizzle-orm/pg-core";
import { users } from "@/modules/identity/infrastructure/auth-schema";
import {
  labSessions,
  sessionParticipants,
} from "@/modules/academic/infrastructure/academic-schema";
import { reservations } from "@/modules/reservations/infrastructure/reservation-schema";
import { resources } from "@/modules/spatial/infrastructure/spatial-schema";
import type { UsageSource } from "../domain/usage";
export const resourceUsage = pgTable(
  "resource_usage",
  {
    id: uuid("id")
      .default(sql`pg_catalog.gen_random_uuid()`)
      .primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    resourceId: uuid("resource_id").notNull(),
    spaceId: uuid("space_id").notNull(),
    sessionId: uuid("session_id"),
    reservationId: uuid("reservation_id"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("resource_usage_active_user_resource_idx")
      .on(t.userId, t.resourceId)
      .where(sql`${t.endedAt} is null`),
    uniqueIndex("resource_usage_id_resource_space_idx").on(
      t.id,
      t.resourceId,
      t.spaceId,
    ),
    index("resource_usage_resource_time_idx").on(t.resourceId, t.startedAt),
    index("resource_usage_user_idx").on(t.userId),
    foreignKey({
      name: "resource_usage_resource_space_fk",
      columns: [t.resourceId, t.spaceId],
      foreignColumns: [resources.id, resources.spaceId],
    }).onDelete("restrict"),
    foreignKey({
      name: "resource_usage_session_space_fk",
      columns: [t.sessionId, t.spaceId],
      foreignColumns: [labSessions.id, labSessions.spaceId],
    }).onDelete("restrict"),
    foreignKey({
      name: "resource_usage_participant_fk",
      columns: [t.sessionId, t.userId],
      foreignColumns: [
        sessionParticipants.sessionId,
        sessionParticipants.userId,
      ],
    }).onDelete("restrict"),
    foreignKey({
      name: "resource_usage_reservation_space_fk",
      columns: [t.reservationId, t.spaceId],
      foreignColumns: [reservations.id, reservations.spaceId],
    }).onDelete("restrict"),
    check(
      "resource_usage_context_check",
      sql`(${t.sessionId} is not null) <> (${t.reservationId} is not null)`,
    ),
    check(
      "resource_usage_interval_check",
      sql`isfinite(${t.startedAt}) and (${t.endedAt} is null or (isfinite(${t.endedAt}) and ${t.endedAt} >= ${t.startedAt}))`,
    ),
  ],
);
export const usageEvents = pgTable(
  "usage_events",
  {
    id: uuid("id")
      .default(sql`pg_catalog.gen_random_uuid()`)
      .primaryKey(),
    usageId: uuid("usage_id")
      .notNull()
      .references(() => resourceUsage.id, { onDelete: "restrict" }),
    actorUserId: uuid("actor_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    source: text("source").$type<UsageSource>().notNull(),
    action: text("action").notNull(),
    snapshot: jsonb("snapshot").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("usage_events_usage_idx").on(t.usageId),
    check(
      "usage_events_source_check",
      sql`${t.source} in ('WEB','API','AGENT','SYSTEM')`,
    ),
  ],
);
