import { notFound, redirect } from "next/navigation";
import { requireCurrentActor } from "@/app/_lib/current-actor";
import { AppShell } from "@/app/_shell/app-shell";
import { ACCOUNT_NAVIGATION, labNavigation } from "@/app/_shell/navigation";
import { AuthorizationDeniedError } from "@/modules/identity/domain/access-errors";
import {
  getLaboratoryBySlug,
  passwordChangePendingFor,
} from "@/modules/identity/infrastructure/services";
import { notificationsWeb } from "@/modules/notifications/web/services";

export default async function LaboratoryLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}>) {
  const [{ slug }, { actorUserId, user }] = await Promise.all([
    params,
    requireCurrentActor(),
  ]);
  if (await passwordChangePendingFor(actorUserId))
    redirect("/app/account/security?reason=temporary-password");

  let laboratory;
  try {
    laboratory = await getLaboratoryBySlug.execute({
      actorUserId,
      laboratorySlug: slug,
    });
  } catch (error) {
    if (error instanceof AuthorizationDeniedError) notFound();
    throw error;
  }
  const navigation = labNavigation(laboratory.slug, laboratory.permissionKeys);
  const unread = await notificationsWeb.unreadCount();

  return (
    <AppShell
      context={{ title: laboratory.name, home: navigation.home }}
      groups={navigation.groups}
      account={ACCOUNT_NAVIGATION}
      user={user}
      unread={unread}
    >
      {children}
    </AppShell>
  );
}
