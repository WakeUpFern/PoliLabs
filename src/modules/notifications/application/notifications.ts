import { notificationId, NotificationError } from "../domain/notifications";
import type { NotificationStore } from "./notification-store";
// In-app notification center. Every operation is scoped to the actor's own
// notifications in laboratories where the membership is still active.
export class NotificationService {
  constructor(private readonly store: NotificationStore) {}
  list(input: { actorUserId: string; limit?: number }) {
    const limit = input.limit ?? 50;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)
      throw new NotificationError("input");
    return this.store.run(notificationId(input.actorUserId), (tx) =>
      tx.list(limit),
    );
  }
  unreadCount(input: { actorUserId: string }) {
    return this.store.run(notificationId(input.actorUserId), (tx) =>
      tx.unreadCount(),
    );
  }
  markRead(input: { actorUserId: string; notificationId: string }) {
    const id = notificationId(input.notificationId);
    return this.store.run(notificationId(input.actorUserId), (tx) =>
      tx.markRead(id),
    );
  }
  markAllRead(input: { actorUserId: string }) {
    return this.store.run(notificationId(input.actorUserId), (tx) =>
      tx.markAllRead(),
    );
  }
}
