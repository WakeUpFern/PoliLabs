import { requireCurrentActor } from "@/app/_lib/current-actor";
import { AppShell } from "@/app/_shell/app-shell";
import { ACCOUNT_NAVIGATION } from "@/app/_shell/navigation";
import { getUserLaboratories } from "@/modules/identity/infrastructure/services";
import { notificationsWeb } from "@/modules/notifications/web/services";

export default async function AccountLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { actorUserId, user } = await requireCurrentActor();
  const [unread, laboratories] = await Promise.all([
    notificationsWeb.unreadCount(),
    getUserLaboratories.execute(actorUserId),
  ]);
  return (
    <AppShell
      laboratory={null}
      laboratories={laboratories}
      account={ACCOUNT_NAVIGATION}
      user={user}
      unread={unread}
    >
      {children}
    </AppShell>
  );
}
