import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, FlaskConical } from "lucide-react";
import { requireCurrentActor } from "@/app/_lib/current-actor";
import {
  getUserLaboratories,
  passwordChangePendingFor,
} from "@/modules/identity/infrastructure/services";

export default async function LaboratoriesPage({
  searchParams,
}: {
  searchParams: Promise<{ choose?: string }>;
}) {
  const [{ actorUserId, user }, query] = await Promise.all([
    requireCurrentActor(),
    searchParams,
  ]);
  if (await passwordChangePendingFor(actorUserId))
    redirect("/app/account/security?reason=temporary-password");
  const laboratories = await getUserLaboratories.execute(actorUserId);

  // Most people belong to one laboratory: take them straight to it.
  if (laboratories.length === 1 && query.choose === undefined)
    redirect(`/app/labs/${encodeURIComponent(laboratories[0].slug)}`);

  return (
    <div className="max-w-3xl">
      <h1 className="text-3xl font-bold tracking-tight">Tus laboratorios</h1>
      <p className="mt-2 leading-7 text-muted">
        Hola, {user.name}. Elige el laboratorio donde vas a trabajar.
      </p>

      {laboratories.length === 0 ? (
        <section className="mt-8 rounded-xl border border-dashed border-line bg-surface p-8">
          <h2 className="text-lg font-semibold">Aún no tienes laboratorio</h2>
          <p className="mt-2 leading-6 text-muted">
            Tu cuenta está activa, pero nadie te ha dado acceso a un
            laboratorio. Pide a tu profesor o a la persona responsable que te
            agregue.
          </p>
        </section>
      ) : (
        <ul className="mt-8 divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
          {laboratories.map((laboratory) => (
            <li key={laboratory.id}>
              <Link
                href={`/app/labs/${encodeURIComponent(laboratory.slug)}`}
                className="flex items-center gap-4 px-5 py-4 transition hover:bg-paper"
              >
                <span className="grid size-11 flex-none place-items-center rounded-lg bg-guinda-tint text-guinda">
                  <FlaskConical aria-hidden className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-lg font-semibold">
                    {laboratory.name}
                  </span>
                  <span className="block text-sm text-muted">
                    {laboratory.roleNames.length > 0
                      ? laboratory.roleNames.join(", ")
                      : "Sin rol asignado"}
                  </span>
                </span>
                <ChevronRight aria-hidden className="size-5 text-muted" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
