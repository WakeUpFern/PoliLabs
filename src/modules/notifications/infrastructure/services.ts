import "server-only";
import { getDatabase } from "@/infrastructure/database/client";
import { readEmailConfig } from "@/config/email-env";
import { readAppOrigin } from "@/config/document-storage-env";
import { NotificationService } from "../application/notifications";
import { DeliveryDispatcher } from "../application/delivery-dispatcher";
import {
  DrizzleDeliveryStore,
  DrizzleNotificationStore,
} from "./notification-store";
import { FileEmailSender } from "./file-email-sender";
export const notificationService = new NotificationService(
  new DrizzleNotificationStore(getDatabase()),
);
// Best-effort dispatch after a request commits; the dispatch script retries
// whatever stays pending. Errors never reach the user who triggered the event.
export async function dispatchPendingNotifications() {
  try {
    const email = readEmailConfig(process.env);
    if (email.transport === "disabled") return;
    await new DeliveryDispatcher(
      new DrizzleDeliveryStore(getDatabase()),
      new FileEmailSender(email.outboxDir, email.from),
      readAppOrigin(process.env),
    ).dispatch();
  } catch {
    console.error(
      "Notification dispatch failed; pending deliveries remain for notifications:dispatch.",
    );
  }
}
