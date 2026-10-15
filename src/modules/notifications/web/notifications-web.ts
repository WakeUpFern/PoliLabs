import type { NotificationService } from "../application/notifications";
import { notificationPath } from "../domain/notifications";
export class NotificationsWeb {
  constructor(
    private readonly services: {
      currentActor: () => Promise<{ actorUserId: string }>;
      notifications: NotificationService;
    },
  ) {}
  async page() {
    const { actorUserId } = await this.services.currentActor();
    const entries = await this.services.notifications.list({ actorUserId });
    return entries.map((entry) => ({
      ...entry,
      path: notificationPath(entry),
    }));
  }
  async unreadCount() {
    const { actorUserId } = await this.services.currentActor();
    return this.services.notifications.unreadCount({ actorUserId });
  }
  // Marks the notification as read and returns where it points.
  async open(form: FormData) {
    const { actorUserId } = await this.services.currentActor();
    const entry = await this.services.notifications.markRead({
      actorUserId,
      notificationId: String(form.get("notificationId") ?? ""),
    });
    return notificationPath(entry);
  }
  async markAllRead() {
    const { actorUserId } = await this.services.currentActor();
    return this.services.notifications.markAllRead({ actorUserId });
  }
}
