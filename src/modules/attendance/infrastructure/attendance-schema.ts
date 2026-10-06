import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
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
import { locations } from "@/modules/spatial/infrastructure/spatial-schema";
import type { AttendanceStatus, OperationSource } from "../domain/attendance";
export const attendance = pgTable(
  "attendance",
  {
    id: uuid("id")
      .default(sql`pg_catalog.gen_random_uuid()`)
      .primaryKey(),
    sessionId: uuid("session_id").notNull(),
    userId: uuid("user_id").notNull(),
    spaceId: uuid("space_id").notNull(),
    checkInAt: timestamp("check_in_at", { withTimezone: true }),
    locationId: uuid("location_id"),
    status: text("status").$type<AttendanceStatus>().notNull(),
    recordedBy: uuid("recorded_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    version: integer("version").default(1).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("attendance_session_user_idx").on(t.sessionId, t.userId),
    index("attendance_user_idx").on(t.userId),
    foreignKey({
      name: "attendance_participant_fk",
      columns: [t.sessionId, t.userId],
      foreignColumns: [
        sessionParticipants.sessionId,
        sessionParticipants.userId,
      ],
    }).onDelete("restrict"),
    foreignKey({
      name: "attendance_session_space_fk",
      columns: [t.sessionId, t.spaceId],
      foreignColumns: [labSessions.id, labSessions.spaceId],
    }).onDelete("restrict"),
    foreignKey({
      name: "attendance_location_space_fk",
      columns: [t.locationId, t.spaceId],
      foreignColumns: [locations.id, locations.spaceId],
    }).onDelete("restrict"),
    check(
      "attendance_status_check",
      sql`${t.status} in ('present','late','absent')`,
    ),
    check(
      "attendance_time_check",
      sql`${t.checkInAt} is null or isfinite(${t.checkInAt})`,
    ),
    check("attendance_version_check", sql`${t.version} > 0`),
  ],
);
export const attendanceEvents = pgTable(
  "attendance_events",
  {
    id: uuid("id")
      .default(sql`pg_catalog.gen_random_uuid()`)
      .primaryKey(),
    attendanceId: uuid("attendance_id")
      .notNull()
      .references(() => attendance.id, { onDelete: "restrict" }),
    actorUserId: uuid("actor_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    source: text("source").$type<OperationSource>().notNull(),
    action: text("action").notNull(),
    reason: text("reason"),
    snapshot: jsonb("snapshot").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("attendance_events_attendance_idx").on(t.attendanceId),
    check(
      "attendance_events_source_check",
      sql`${t.source} in ('WEB','API','AGENT','SYSTEM')`,
    ),
  ],
);
