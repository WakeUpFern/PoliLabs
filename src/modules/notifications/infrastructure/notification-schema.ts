import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  check,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { users } from "@/modules/identity/infrastructure/auth-schema";
import { laboratories } from "@/modules/identity/infrastructure/access-schema";
import type {
  NotificationType,
  NotificationReferenceType,
  NotificationChannel,
  DeliveryStatus,
} from "../domain/notifications";
export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id")
      .default(sql`pg_catalog.gen_random_uuid()`)
      .primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    laboratoryId: uuid("laboratory_id")
      .notNull()
      .references(() => laboratories.id, { onDelete: "restrict" }),
    type: text("type").$type<NotificationType>().notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    referenceType: text("reference_type")
      .$type<NotificationReferenceType>()
      .notNull(),
    referenceId: uuid("reference_id").notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    // One notification per recipient and event: re-emitting is idempotent.
    uniqueIndex("notifications_user_event_idx").on(
      t.userId,
      t.type,
      t.referenceType,
      t.referenceId,
    ),
    index("notifications_user_time_idx").on(t.userId, t.createdAt),
    index("notifications_user_unread_idx")
      .on(t.userId)
      .where(sql`${t.readAt} is null`),
    check(
      "notifications_type_check",
      sql`${t.type} in ('incident.reported','incident.resolved')`,
    ),
    check(
      "notifications_reference_type_check",
      sql`${t.referenceType} in ('incident')`,
    ),
    check(
      "notifications_title_check",
      sql`length(btrim(${t.title})) between 1 and 200`,
    ),
    check(
      "notifications_body_check",
      sql`length(btrim(${t.body})) between 1 and 1000`,
    ),
    check(
      "notifications_read_check",
      sql`${t.readAt} is null or ${t.readAt} >= ${t.createdAt}`,
    ),
  ],
);
export const notificationDeliveries = pgTable(
  "notification_deliveries",
  {
    id: uuid("id")
      .default(sql`pg_catalog.gen_random_uuid()`)
      .primaryKey(),
    notificationId: uuid("notification_id")
      .notNull()
      .references(() => notifications.id, { onDelete: "restrict" }),
    channel: text("channel").$type<NotificationChannel>().notNull(),
    status: text("status").$type<DeliveryStatus>().default("pending").notNull(),
    attempts: integer("attempts").default(0).notNull(),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    // Address actually used, recorded once the provider accepted the message.
    recipient: text("recipient"),
    lastError: text("last_error"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("notification_deliveries_notification_channel_idx").on(
      t.notificationId,
      t.channel,
    ),
    index("notification_deliveries_due_idx")
      .on(t.nextAttemptAt)
      .where(sql`${t.status} = 'pending'`),
    check(
      "notification_deliveries_channel_check",
      sql`${t.channel} in ('email')`,
    ),
    check(
      "notification_deliveries_status_check",
      sql`${t.status} in ('pending','sent','failed','skipped')`,
    ),
    check(
      "notification_deliveries_attempts_check",
      sql`${t.attempts} between 0 and 5`,
    ),
    check(
      "notification_deliveries_sent_check",
      sql`(${t.status} = 'sent') = (${t.sentAt} is not null and ${t.recipient} is not null)`,
    ),
    check(
      "notification_deliveries_error_check",
      sql`${t.lastError} is null or ${t.lastError} in ('send-failed')`,
    ),
  ],
);
