import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { requireCurrentActor } from "@/app/_lib/current-actor";
import { NavIcon } from "@/app/_shell/nav-icon";
import { labNavigation, type NavItem } from "@/app/_shell/navigation";
import { getLaboratoryBySlug } from "@/modules/identity/infrastructure/services";
import { AuthorizationDeniedError } from "@/modules/identity/domain/access-errors";

type LaboratoryPageProps = {
  params: Promise<{ slug: string }>;
};

function greeting(now: Date) {
  const hour = Number(
    new Intl.DateTimeFormat("es-MX", {
      hour: "numeric",
      hourCycle: "h23",
      timeZone: "America/Mexico_City",
    }).format(now),
  );
  if (hour < 12) return "Buenos días";
  if (hour < 19) return "Buenas tardes";
  return "Buenas noches";
}

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] ?? name;
}

function ActionTile({ item }: { item: NavItem }) {
  const hintId = `hint-${item.key}`;
  return (
    <Link
      href={item.href}
      aria-label={item.label}
      aria-describedby={hintId}
      className="group flex items-center gap-3.5 rounded-xl border border-line bg-surface px-4 py-3.5 transition hover:border-guinda/40 hover:bg-guinda-tint/40"
    >
      <span className="grid size-10 flex-none place-items-center rounded-lg bg-paper text-guinda transition group-hover:bg-surface">
        <NavIcon name={item.icon} className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{item.label}</span>
        <span
          id={hintId}
          className="mt-0.5 block text-sm leading-snug text-muted"
        >
          {item.hint}
        </span>
      </span>
      <ChevronRight
        aria-hidden
        className="size-4 flex-none text-muted transition group-hover:translate-x-0.5 group-hover:text-guinda"
      />
    </Link>
  );
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

  const { groups } = labNavigation(laboratory.slug, laboratory.permissionKeys);
  const phases = groups.filter((group) => group.step);
  const rest = groups.filter((group) => !group.step);

  return (
    <div>
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
        {greeting(new Date())}, {firstName(user.name)}
      </h1>
      <p className="mt-2 max-w-2xl leading-7 text-muted">
        Todo está ordenado como ocurre una práctica: primero se prepara, luego
        se trabaja en el laboratorio y al final se da seguimiento.
      </p>

      {phases.length === 0 ? (
        <section className="mt-8 rounded-xl border border-dashed border-line bg-surface p-8">
          <h2 className="text-lg font-semibold">Aún no tienes actividades</h2>
          <p className="mt-2 leading-6 text-muted">
            Tu cuenta tiene acceso a este laboratorio, pero sin un rol que
            permita trabajar en prácticas. Pide a tu profesor que revise tu rol
            en Personas.
          </p>
        </section>
      ) : (
        <ol
          aria-label="Recorrido de la práctica"
          className="mt-9 grid gap-0 lg:grid-cols-3 lg:gap-6"
        >
          {phases.map((phase, index) => {
            const last = index === phases.length - 1;
            return (
              <li
                key={phase.key}
                className="relative pb-8 pl-14 lg:pb-0 lg:pl-0"
              >
                {/* The line that joins the stations of the route. */}
                {!last ? (
                  <span
                    aria-hidden
                    className="absolute top-11 bottom-0 left-[1.3125rem] w-0.5 bg-guinda/20 lg:top-[1.3125rem] lg:right-[-1.5rem] lg:bottom-auto lg:left-11 lg:h-0.5 lg:w-auto"
                  />
                ) : null}
                <div className="absolute top-0 left-0 lg:static">
                  <span className="grid size-11 place-items-center rounded-full border-2 border-guinda bg-surface text-lg font-bold text-guinda">
                    {phase.step}
                  </span>
                </div>
                <div className="lg:mt-4">
                  <h2 className="pt-2 text-xl font-bold lg:pt-0">
                    {phase.title}
                  </h2>
                  <p className="mt-1 text-[0.9375rem] text-muted">
                    {phase.summary}
                  </p>
                  <div className="mt-4 flex flex-col gap-2.5">
                    {phase.items.map((item) => (
                      <ActionTile key={item.key} item={item} />
                    ))}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {rest.map((group) => (
        <section
          key={group.key}
          className="mt-12 border-t border-line pt-6"
          aria-labelledby={`group-${group.key}`}
        >
          <h2 id={`group-${group.key}`} className="text-lg font-bold">
            {group.title}
          </h2>
          <p className="mt-1 text-[0.9375rem] text-muted">{group.summary}</p>
          <div className="mt-4 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {group.items.map((item) => (
              <ActionTile key={item.key} item={item} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
