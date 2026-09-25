import Link from "next/link";
import { requireCurrentActor } from "@/app/_lib/current-actor";
import { getUserLaboratories } from "@/modules/identity/infrastructure/services";

export default async function LaboratoriesPage() {
  const { actorUserId, user } = await requireCurrentActor();
  const laboratories = await getUserLaboratories.execute(actorUserId);

  return (
    <div>
      <p className="text-sm font-semibold text-[#7a1731]">Espacio de trabajo</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
        Tus laboratorios
      </h1>
      <p className="mt-3 max-w-2xl leading-7 text-stone-600">
        Hola, {user.name}. Aquí aparecen únicamente los laboratorios donde
        tienes una membresía activa.
      </p>

      {laboratories.length === 0 ? (
        <section className="mt-8 rounded-2xl border border-dashed border-stone-300 bg-white/60 p-8 text-center">
          <h2 className="text-lg font-semibold">
            Sin laboratorios disponibles
          </h2>
          <p className="mt-2 text-sm leading-6 text-stone-600">
            Tu cuenta está activa, pero no tiene una membresía activa en un
            laboratorio. Solicita ayuda a la persona responsable.
          </p>
        </section>
      ) : (
        <ul className="mt-8 grid gap-4 sm:grid-cols-2">
          {laboratories.map((laboratory) => (
            <li key={laboratory.id}>
              <Link
                href={`/app/labs/${encodeURIComponent(laboratory.slug)}`}
                className="group flex h-full min-h-52 flex-col rounded-2xl border border-stone-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-[#7a1731]/30 hover:shadow-md focus:outline-none focus:ring-4 focus:ring-[#7a1731]/10"
              >
                <span className="text-xs font-bold uppercase tracking-[0.18em] text-[#7a1731]">
                  Laboratorio
                </span>
                <h2 className="mt-4 text-2xl font-semibold tracking-tight">
                  {laboratory.name}
                </h2>
                <div className="mt-5 flex flex-wrap gap-2">
                  {laboratory.roleNames.length > 0 ? (
                    laboratory.roleNames.map((role) => (
                      <span
                        key={role}
                        className="rounded-full bg-stone-100 px-3 py-1 text-xs font-medium text-stone-700"
                      >
                        {role}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-stone-500">
                      Sin roles asignados
                    </span>
                  )}
                </div>
                <span className="mt-auto pt-7 text-sm font-semibold text-[#7a1731]">
                  Entrar al laboratorio <span aria-hidden="true">→</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
