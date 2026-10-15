import "server-only";
import { requireCurrentActor } from "@/app/_lib/current-actor";
import { notificationService } from "../infrastructure/services";
import { NotificationsWeb } from "./notifications-web";
export const notificationsWeb = new NotificationsWeb({
  currentActor: requireCurrentActor,
  notifications: notificationService,
});
