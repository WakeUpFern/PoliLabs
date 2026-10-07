import Link from "next/link";
import { incidentsWeb } from "@/modules/incidents/web/services";
import { maintenanceWeb } from "@/modules/maintenance/web/services";
import { notFound } from "next/navigation";
import { requireCurrentActor } from "@/app/_lib/current-actor";
import { LogoutButton } from "@/app/_components/logout-button";
import { getLaboratoryBySlug } from "@/modules/identity/infrastructure/services";
import { AuthorizationDeniedError } from "@/modules/identity/domain/access-errors";

type LaboratoryPageProps = {
  params: Promise<{ slug: string }>;
};

function formatRole(roleKey: string) {
  return roleKey
    .split("_")
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

export default async function LaboratoryPage({ params }: LaboratoryPageProps) {
  const [{ slug }, { actorUserId, user }] = await Promise.all([
    params,
    requireCurrentActor(),
  ]);

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

  const [incidentAccess, maintenanceAccess] = await Promise.all([
    incidentsWeb.access(slug),
    maintenanceWeb.access(slug),
  ]);
  return (
    <div>
      <Link
        href="/app"
        className="text-sm font-semibold text-stone-600 transition hover:text-[#7a1731]"
      >
        <span aria-hidden="true">←</span> Mis laboratorios
      </Link>

      <section className="mt-6 overflow-hidden rounded-3xl bg-[#641229] text-white shadow-lg shadow-[#641229]/10">
        <div className="p-7 sm:p-10">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#e2c68f]">
            Contexto autorizado
          </p>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-5xl">
            {laboratory.name}
          </h1>
          <p className="mt-4 max-w-2xl leading-7 text-white/72">
            Sesión activa de {user.name}. Trabaja únicamente con los datos
            autorizados para este laboratorio.
          </p>
        </div>
        <div className="grid gap-px bg-white/15 sm:grid-cols-2">
          <div className="bg-[#641229] px-7 py-5 sm:px-10">
            <p className="text-xs uppercase tracking-wider text-white/55">
              Usuario
            </p>
            <p className="mt-1 font-semibold">{user.email}</p>
          </div>
          <div className="bg-[#641229] px-7 py-5 sm:px-10">
            <p className="text-xs uppercase tracking-wider text-white/55">
              Roles en este laboratorio
            </p>
            <p className="mt-1 font-semibold">
              {laboratory.roleKeys.length > 0
                ? laboratory.roleKeys.map(formatRole).join(" · ")
                : "Sin roles asignados"}
            </p>
          </div>
        </div>
      </section>

      <section className="mt-8 rounded-2xl border border-stone-200 bg-white p-6 sm:p-8">
        <h2 className="text-lg font-semibold">Navegación del laboratorio</h2>
        <p className="mt-2 text-sm leading-6 text-stone-600">
          Spatial I y II habilitan espacios, ubicaciones jerárquicas y recursos
          físicos. Reservaciones permite consultar disponibilidad y gestionar
          tus reservaciones individuales. Inventario permite consultar
          materiales, herramientas y movimientos. Prácticas permite gestionar
          instrucciones, sesiones y participantes.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            href={`/app/labs/${slug}/spaces`}
            className="rounded-xl bg-[#7a1731] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#651128]"
          >
            Espacios
          </Link>
          <Link
            href={`/app/labs/${slug}/reservations`}
            className="rounded-xl bg-[#7a1731] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#651128]"
          >
            Reservaciones
          </Link>
          <Link
            href={`/app/labs/${slug}/inventory`}
            className="rounded-xl bg-[#7a1731] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#651128]"
          >
            Inventario
          </Link>
          <Link
            href={`/app/labs/${slug}/academic`}
            className="rounded-xl bg-[#7a1731] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#651128]"
          >
            Prácticas
          </Link>
          <Link
            href={`/app/labs/${slug}/attendance`}
            className="rounded-xl bg-[#7a1731] px-4 py-2 text-sm font-semibold text-white"
          >
            Asistencia
          </Link>
          <Link
            href={`/app/labs/${slug}/usage`}
            className="rounded-xl bg-[#7a1731] px-4 py-2 text-sm font-semibold text-white"
          >
            Uso de maquinaria
          </Link>
          {incidentAccess.canReadOwn ||
          incidentAccess.canReview ||
          incidentAccess.canCreate ? (
            <Link
              href={
                incidentAccess.canReadOwn
                  ? `/app/labs/${slug}/incidents`
                  : incidentAccess.canReview
                    ? `/app/labs/${slug}/incidents?scope=laboratory`
                    : `/app/labs/${slug}/incidents/new`
              }
              className="rounded-xl bg-[#7a1731] px-4 py-2 text-sm font-semibold text-white"
            >
              Incidencias
            </Link>
          ) : null}
          {maintenanceAccess.canRead ? (
            <Link
              href={`/app/labs/${slug}/maintenance`}
              className="rounded-xl bg-[#7a1731] px-4 py-2 text-sm font-semibold text-white"
            >
              Mantenimiento
            </Link>
          ) : null}
        </div>
        <div className="mt-8 border-t border-stone-200 pt-6">
          <LogoutButton />
        </div>
      </section>
    </div>
  );
}
