import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  timestamp,
  check,
  foreignKey,
  uniqueIndex,
  index,
  primaryKey,
  jsonb,
} from "drizzle-orm/pg-core";
import {
  laboratories,
  laboratoryMemberships,
} from "@/modules/identity/infrastructure/access-schema";
import { users } from "@/modules/identity/infrastructure/auth-schema";
import { spaces } from "@/modules/spatial/infrastructure/spatial-schema";
import type {
  PracticeStatus,
  SessionStatus,
  AcademicSource,
} from "../domain/academic";
const id = () =>
  uuid("id")
    .default(sql`pg_catalog.gen_random_uuid()`)
    .primaryKey();
const timestamps = () => ({
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
export const practices = pgTable(
  "practices",
  {
    id: id(),
    laboratoryId: uuid("laboratory_id")
      .notNull()
      .references(() => laboratories.id, { onDelete: "restrict" }),
    title: text("title").notNull(),
    instructions: text("instructions").notNull(),
    status: text("status").$type<PracticeStatus>().default("draft").notNull(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("practices_id_laboratory_idx").on(t.id, t.laboratoryId),
    index("practices_laboratory_idx").on(t.laboratoryId),
    check(
      "practices_title_check",
      sql`length(btrim(${t.title})) between 1 and 200`,
    ),
    check(
      "practices_instructions_check",
      sql`length(btrim(${t.instructions})) between 1 and 20000`,
    ),
    check(
      "practices_status_check",
      sql`${t.status} in ('draft','published','closed')`,
    ),
  ],
);
export const labSessions = pgTable(
  "lab_sessions",
  {
    id: id(),
    laboratoryId: uuid("laboratory_id").notNull(),
    practiceId: uuid("practice_id").notNull(),
    spaceId: uuid("space_id").notNull(),
    teacherUserId: uuid("teacher_user_id").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    status: text("status")
      .$type<SessionStatus>()
      .default("scheduled")
      .notNull(),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("lab_sessions_id_space_idx").on(t.id, t.spaceId),
    uniqueIndex("lab_sessions_id_laboratory_idx").on(t.id, t.laboratoryId),
    uniqueIndex("lab_sessions_id_practice_laboratory_idx").on(
      t.id,
      t.practiceId,
      t.laboratoryId,
    ),
    index("lab_sessions_practice_idx").on(t.practiceId),
    foreignKey({
      name: "lab_sessions_practice_laboratory_fk",
      columns: [t.practiceId, t.laboratoryId],
      foreignColumns: [practices.id, practices.laboratoryId],
    }).onDelete("restrict"),
    foreignKey({
      name: "lab_sessions_space_laboratory_fk",
      columns: [t.spaceId, t.laboratoryId],
      foreignColumns: [spaces.id, spaces.laboratoryId],
    }).onDelete("restrict"),
    foreignKey({
      name: "lab_sessions_teacher_laboratory_fk",
      columns: [t.teacherUserId, t.laboratoryId],
      foreignColumns: [
        laboratoryMemberships.userId,
        laboratoryMemberships.laboratoryId,
      ],
    }).onDelete("restrict"),
    check(
      "lab_sessions_interval_check",
      sql`isfinite(${t.startsAt}) and isfinite(${t.endsAt}) and ${t.startsAt} < ${t.endsAt}`,
    ),
    check(
      "lab_sessions_status_check",
      sql`${t.status} in ('scheduled','open','closed','cancelled')`,
    ),
  ],
);
export const sessionParticipants = pgTable(
  "session_participants",
  {
    sessionId: uuid("session_id").notNull(),
    laboratoryId: uuid("laboratory_id").notNull(),
    userId: uuid("user_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    primaryKey({
      name: "session_participants_pk",
      columns: [t.sessionId, t.userId],
    }),
    index("session_participants_user_idx").on(t.userId, t.laboratoryId),
    foreignKey({
      name: "session_participants_session_laboratory_fk",
      columns: [t.sessionId, t.laboratoryId],
      foreignColumns: [labSessions.id, labSessions.laboratoryId],
    }).onDelete("restrict"),
    foreignKey({
      name: "session_participants_member_laboratory_fk",
      columns: [t.userId, t.laboratoryId],
      foreignColumns: [
        laboratoryMemberships.userId,
        laboratoryMemberships.laboratoryId,
      ],
    }).onDelete("restrict"),
  ],
);
export const academicEvents = pgTable(
  "academic_events",
  {
    id: id(),
    laboratoryId: uuid("laboratory_id").notNull(),
    practiceId: uuid("practice_id").notNull(),
    sessionId: uuid("session_id"),
    actorUserId: uuid("actor_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    action: text("action").notNull(),
    source: text("source").$type<AcademicSource>().notNull(),
    snapshot: jsonb("snapshot").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("academic_events_practice_idx").on(t.practiceId, t.createdAt),
    foreignKey({
      name: "academic_events_practice_laboratory_fk",
      columns: [t.practiceId, t.laboratoryId],
      foreignColumns: [practices.id, practices.laboratoryId],
    }).onDelete("restrict"),
    foreignKey({
      name: "academic_events_session_practice_fk",
      columns: [t.sessionId, t.practiceId, t.laboratoryId],
      foreignColumns: [
        labSessions.id,
        labSessions.practiceId,
        labSessions.laboratoryId,
      ],
    }).onDelete("restrict"),
    check(
      "academic_events_source_check",
      sql`${t.source} in ('WEB','API','AGENT','SYSTEM')`,
    ),
  ],
);
