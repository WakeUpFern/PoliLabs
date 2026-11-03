"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { notificationsWeb } from "@/modules/notifications/web/services";
import { NotificationError } from "@/modules/notifications/domain/notifications";
export async function openNotification(form: FormData) {
  let path: string;
  try {
    path = await notificationsWeb.open(form);
  } catch (error) {
    if (error instanceof NotificationError) redirect("/app/notifications");
    throw error;
  }
  revalidatePath("/app", "layout");
  redirect(path);
}
export async function markAllNotificationsRead() {
  await notificationsWeb.markAllRead();
  revalidatePath("/app", "layout");
}
