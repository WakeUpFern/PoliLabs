import Link from "next/link";
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
            Sesión activa de {user.name}. Las funciones disponibles se
            habilitarán conforme se implementen los siguientes módulos.
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
          Los módulos operativos todavía no forman parte de este incremento.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          {["Prácticas", "Reservaciones", "Inventario", "Mantenimiento"].map(
            (item) => (
              <span
                key={item}
                aria-disabled="true"
                className="cursor-not-allowed rounded-xl border border-stone-200 bg-stone-50 px-4 py-2 text-sm text-stone-400"
              >
                {item}
              </span>
            ),
          )}
        </div>
        <div className="mt-8 border-t border-stone-200 pt-6">
          <LogoutButton />
        </div>
      </section>
    </div>
  );
}
