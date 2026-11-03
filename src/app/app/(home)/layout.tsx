import { requireCurrentActor } from "@/app/_lib/current-actor";
import { AppShell } from "@/app/_shell/app-shell";
import { ACCOUNT_NAVIGATION } from "@/app/_shell/navigation";
import { notificationsWeb } from "@/modules/notifications/web/services";

export default async function AccountLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const [{ user }, unread] = await Promise.all([
    requireCurrentActor(),
    notificationsWeb.unreadCount(),
  ]);
  return (
    <AppShell
      context={null}
      groups={[]}
      account={ACCOUNT_NAVIGATION}
      user={user}
      unread={unread}
    >
      {children}
    </AppShell>
  );
}
