import { and, eq, desc, asc, sql, lte, isNull } from "drizzle-orm";
import type { OperationDatabase } from "@/modules/identity/infrastructure/authorize-locked";
import { users } from "@/modules/identity/infrastructure/auth-schema";
import { laboratories } from "@/modules/identity/infrastructure/access-schema";
import {
  NotificationError,
  notificationPath,
  renderNotificationEmail,
  type NotificationEntry,
} from "../domain/notifications";
import type {
  ClaimedDelivery,
  DeliveryStore,
  NotificationStore,
  NotificationTransaction,
} from "../application/notification-store";
import { notifications, notificationDeliveries } from "./notification-schema";
type Transaction = Parameters<
  Parameters<OperationDatabase["transaction"]>[0]
>[0];
const entryColumns = {
  id: notifications.id,
  type: notifications.type,
  laboratoryName: laboratories.name,
  laboratorySlug: laboratories.slug,
  referenceId: notifications.referenceId,
  title: notifications.title,
  body: notifications.body,
  readAt: notifications.readAt,
  createdAt: notifications.createdAt,
};
// Notifications stay visible only while the recipient remains an active
// member of an active laboratory.
const activeMembership = sql`exists (select 1 from laboratory_memberships m join laboratories l on l.id = m.laboratory_id where m.user_id = ${notifications.userId} and m.laboratory_id = ${notifications.laboratoryId} and m.is_active and l.is_active)`;
class DrizzleNotificationTransaction implements NotificationTransaction {
  constructor(
    private readonly tx: Transaction,
    private readonly actorUserId: string,
  ) {}
  private own(id?: string) {
    return and(
      eq(notifications.userId, this.actorUserId),
      id ? eq(notifications.id, id) : undefined,
      activeMembership,
    );
  }
  list(limit: number): Promise<NotificationEntry[]> {
    return this.tx
      .select(entryColumns)
      .from(notifications)
      .innerJoin(laboratories, eq(laboratories.id, notifications.laboratoryId))
      .where(this.own())
      .orderBy(desc(notifications.createdAt), desc(notifications.id))
      .limit(limit);
  }
  async unreadCount() {
    const [row] = await this.tx
      .select({ count: sql<number>`count(*)::int` })
      .from(notifications)
      .where(and(this.own(), isNull(notifications.readAt)));
    return row.count;
  }
  async markRead(id: string) {
    // Reading is idempotent: the first read time is preserved.
    const updated = await this.tx
      .update(notifications)
      .set({
        readAt: sql`coalesce(${notifications.readAt}, clock_timestamp())`,
      })
      .where(this.own(id))
      .returning({ id: notifications.id });
    if (!updated.length) throw new NotificationError("not-found");
    const [row] = await this.tx
      .select(entryColumns)
      .from(notifications)
      .innerJoin(laboratories, eq(laboratories.id, notifications.laboratoryId))
      .where(eq(notifications.id, id));
    return row;
  }
  async markAllRead() {
    const updated = await this.tx
      .update(notifications)
      .set({ readAt: sql`clock_timestamp()` })
      .where(and(this.own(), isNull(notifications.readAt)))
      .returning({ id: notifications.id });
    return updated.length;
  }
}
export class DrizzleNotificationStore implements NotificationStore {
  constructor(private readonly db: OperationDatabase) {}
  run<T>(
    actorUserId: string,
    operation: (tx: NotificationTransaction) => Promise<T>,
  ) {
    return this.db.transaction(
      (tx) => operation(new DrizzleNotificationTransaction(tx, actorUserId)),
      { isolationLevel: "read committed" },
    );
  }
}
export class DrizzleDeliveryStore implements DeliveryStore {
  constructor(private readonly db: OperationDatabase) {}
  attemptNext(
    appOrigin: string,
    operation: Parameters<DeliveryStore["attemptNext"]>[1],
  ) {
    return this.db.transaction(
      async (tx) => {
        // SKIP LOCKED lets concurrent dispatchers work on different rows.
        const [row] = await tx
          .select({
            id: notificationDeliveries.id,
            attempts: notificationDeliveries.attempts,
            type: notifications.type,
            referenceId: notifications.referenceId,
            title: notifications.title,
            body: notifications.body,
            laboratoryName: laboratories.name,
            laboratorySlug: laboratories.slug,
            email: users.email,
            name: users.name,
            active: sql<boolean>`${users.isActive} and ${activeMembership}`,
          })
          .from(notificationDeliveries)
          .innerJoin(
            notifications,
            eq(notifications.id, notificationDeliveries.notificationId),
          )
          .innerJoin(users, eq(users.id, notifications.userId))
          .innerJoin(
            laboratories,
            eq(laboratories.id, notifications.laboratoryId),
          )
          .where(
            and(
              eq(notificationDeliveries.status, "pending"),
              lte(notificationDeliveries.nextAttemptAt, sql`clock_timestamp()`),
            ),
          )
          .orderBy(
            asc(notificationDeliveries.nextAttemptAt),
            asc(notificationDeliveries.id),
          )
          .limit(1)
          .for("update", { of: notificationDeliveries, skipLocked: true });
        if (!row) return false;
        let message: ClaimedDelivery["message"] = null;
        try {
          message = renderNotificationEmail({
            deliveryId: row.id,
            recipientEmail: row.email,
            recipientName: row.name,
            laboratoryName: row.laboratoryName,
            title: row.title,
            body: row.body,
            url: new URL(notificationPath(row), appOrigin).toString(),
          });
        } catch {
          message = null;
        }
        const update = (
          values: Parameters<
            ReturnType<typeof tx.update<typeof notificationDeliveries>>["set"]
          >[0],
        ) =>
          tx
            .update(notificationDeliveries)
            .set({ ...values, updatedAt: sql`clock_timestamp()` })
            .where(eq(notificationDeliveries.id, row.id));
        await operation(
          {
            id: row.id,
            attempts: row.attempts,
            recipientActive: row.active,
            message,
          },
          {
            sent: async (recipient) => {
              await update({
                status: "sent",
                attempts: row.attempts + 1,
                recipient,
                sentAt: sql`clock_timestamp()`,
                lastError: null,
              });
            },
            failed: async ({ attempts, final, delayMs }) => {
              await update({
                status: final ? "failed" : "pending",
                attempts,
                lastError: "send-failed",
                nextAttemptAt: sql`clock_timestamp() + ${`${delayMs} milliseconds`}::interval`,
              });
            },
            skipped: async () => {
              await update({ status: "skipped" });
            },
          },
        );
        return true;
      },
      { isolationLevel: "read committed" },
    );
  }
}
