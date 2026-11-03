import { notFound, redirect } from "next/navigation";
import { requireCurrentActor } from "@/app/_lib/current-actor";
import { AppShell } from "@/app/_shell/app-shell";
import {
  ACCOUNT_NAVIGATION,
  createActions,
  labNavigation,
  quickSections,
} from "@/app/_shell/navigation";
import { AuthorizationDeniedError } from "@/modules/identity/domain/access-errors";
import {
  getLaboratoryBySlug,
  getUserLaboratories,
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
  const [unread, laboratories] = await Promise.all([
    notificationsWeb.unreadCount(),
    getUserLaboratories.execute(actorUserId),
  ]);

  const sections = labNavigation(laboratory.slug, laboratory.permissionKeys);

  return (
    <AppShell
      laboratory={{
        name: laboratory.name,
        href: `/app/labs/${encodeURIComponent(laboratory.slug)}`,
        sections,
        quick: quickSections(sections, laboratory.permissionKeys),
        create: createActions(laboratory.slug, laboratory.permissionKeys),
      }}
      laboratories={laboratories}
      account={ACCOUNT_NAVIGATION}
      user={user}
      unread={unread}
    >
      {children}
    </AppShell>
  );
}
