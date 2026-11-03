import { requireCurrentActor } from "@/app/_lib/current-actor";

export default async function ProtectedAppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Each section below renders its own shell with the navigation it needs.
  await requireCurrentActor();
  return children;
}
