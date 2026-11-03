import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowRightLeft,
  BookOpenText,
  CalendarClock,
  FlaskConical,
  TriangleAlert,
} from "lucide-react";
import { requireCurrentActor } from "@/app/_lib/current-actor";
import { getLaboratoryBySlug } from "@/modules/identity/infrastructure/services";
import { AuthorizationDeniedError } from "@/modules/identity/domain/access-errors";
import { LABORATORY_ROLE_CATALOG } from "@/modules/identity/domain/access-catalog";
import { laboratoryHome } from "./home-data";
import { severityLabels, statusLabels } from "./incidents/labels";

const TIME_ZONE = "America/Mexico_City";
const day = new Intl.DateTimeFormat("es-MX", {
  timeZone: TIME_ZONE,
  weekday: "short",
  day: "numeric",
  month: "short",
});
const time = new Intl.DateTimeFormat("es-MX", {
  timeZone: TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const dateKey = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE });

function sessionDay(startsAt: Date, now: Date) {
  const key = dateKey.format(startsAt);
  if (key === dateKey.format(now)) return "Hoy";
  if (key === dateKey.format(new Date(now.getTime() + 86_400_000)))
    return "Mañana";
  return day.format(startsAt);
}

function Box({
  title,
  icon: Icon,
  action,
  children,
}: {
  title: string;
  icon: typeof BookOpenText;
  action?: { href: string; label: string };
  children: React.ReactNode;
}) {
  return (
    <section className="box overflow-hidden">
      <div className="flex items-center gap-2 border-b border-line bg-paper px-4 py-3">
        <Icon aria-hidden className="size-4 text-muted" />
        <h2 className="flex-1 font-bold">{title}</h2>
        {action ? (
          <Link
            href={action.href}
            className="text-sm font-semibold text-guinda hover:underline"
          >
            {action.label}
          </Link>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="px-4 py-6 text-center text-muted">{children}</div>;
}

export default async function LaboratoryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const [{ slug }, { actorUserId }] = await Promise.all([
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

  const permissions = laboratory.permissionKeys;
  const can = (key: string) => permissions.includes(key);
  const base = `/app/labs/${encodeURIComponent(laboratory.slug)}`;
  const home = await laboratoryHome(laboratory.slug, permissions);
  const now = new Date();
  const roleNames = laboratory.roleKeys.map(
    (key) =>
      LABORATORY_ROLE_CATALOG.find((role) => role.key === key)?.name ?? key,
  );
  const teaches = can("academic.manage");

  // The one action that starts the usual work of this person.
  const primary = teaches
    ? { href: `${base}/academic/practices/new`, label: "Nueva práctica" }
    : can("reservation.create")
      ? { href: `${base}/reservations`, label: "Reservar equipo" }
      : null;

  return (
    <div className="grid gap-8 lg:grid-cols-[17rem_minmax(0,1fr)]">
      <aside className="lg:pt-1">
        <div className="flex items-center gap-4 lg:block">
          <span className="grid size-16 flex-none place-items-center rounded-xl border border-line bg-paper text-guinda lg:size-20">
            <FlaskConical aria-hidden className="size-8 lg:size-10" />
          </span>
          <div className="min-w-0 lg:mt-4">
            <h1 className="text-2xl leading-tight font-bold">
              {laboratory.name}
            </h1>
            <p className="mt-1 text-muted">
              {roleNames.length > 0 ? roleNames.join(", ") : "Sin rol"}
            </p>
          </div>
        </div>
        {primary ? (
          <Link href={primary.href} className="btn btn-primary mt-5 w-full">
            {primary.label}
          </Link>
        ) : null}
      </aside>

      <div className="flex min-w-0 flex-col gap-6">
        {home.academic ? (
          <Box
            title="Tus próximas sesiones"
            icon={CalendarClock}
            action={{ href: `${base}/academic`, label: "Prácticas" }}
          >
            {home.academic.sessions.length === 0 ? (
              <Empty>
                {teaches ? (
                  <>
                    No tienes sesiones programadas.{" "}
                    <Link
                      href={`${base}/academic`}
                      className="font-semibold text-guinda hover:underline"
                    >
                      Programa una desde su práctica
                    </Link>
                    .
                  </>
                ) : (
                  "No tienes sesiones próximas. Aparecerán aquí cuando tu profesor te inscriba."
                )}
              </Empty>
            ) : (
              <ul className="divide-y divide-line">
                {home.academic.sessions.map((session) => {
                  const open = session.status === "open";
                  const action = teaches
                    ? open && home.academic?.canManageAttendance
                      ? {
                          href: `${base}/attendance/sessions/${session.id}`,
                          label: "Pasar lista",
                          primary: true,
                        }
                      : {
                          href: `${base}/academic/sessions/${session.id}`,
                          label: "Ver sesión",
                          primary: false,
                        }
                    : open && home.academic?.canCheckIn
                      ? {
                          href: `${base}/attendance`,
                          label: "Registrar asistencia",
                          primary: true,
                        }
                      : {
                          href: `${base}/academic/practices/${session.practiceId}`,
                          label: "Ver instrucciones",
                          primary: false,
                        };
                  return (
                    <li
                      key={session.id}
                      className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-center gap-x-4 gap-y-3 px-4 py-3 sm:grid-cols-[6rem_minmax(0,1fr)_auto]"
                    >
                      <div>
                        <p className="font-semibold capitalize">
                          {sessionDay(session.startsAt, now)}
                        </p>
                        <p className="text-sm text-muted">
                          {time.format(session.startsAt)}–
                          {time.format(session.endsAt)}
                        </p>
                      </div>
                      <div className="min-w-0">
                        <Link
                          href={`${base}/academic/sessions/${session.id}`}
                          className="font-semibold hover:text-guinda hover:underline"
                        >
                          {session.practiceTitle}
                        </Link>
                        <p className="text-sm">
                          {open ? (
                            <span className="font-semibold text-live">
                              En curso
                            </span>
                          ) : (
                            <span className="text-muted">Programada</span>
                          )}
                        </p>
                      </div>
                      <Link
                        href={action.href}
                        className={`btn col-span-2 sm:col-span-1 ${action.primary ? "btn-primary" : ""}`}
                      >
                        {action.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Box>
        ) : null}

        <div className="grid gap-6 xl:grid-cols-2">
          {home.incidents ? (
            <Box
              title={
                home.incidentsScope === "laboratory"
                  ? "Incidencias por atender"
                  : "Tus reportes"
              }
              icon={TriangleAlert}
              action={
                can("incident.create")
                  ? { href: `${base}/incidents/new`, label: "Reportar falla" }
                  : undefined
              }
            >
              {home.incidents.length === 0 ? (
                <Empty>
                  {home.incidentsScope === "laboratory"
                    ? "Nada pendiente."
                    : "No tienes reportes abiertos."}
                </Empty>
              ) : (
                <ul className="divide-y divide-line">
                  {home.incidents.slice(0, 4).map((incident) => (
                    <li key={incident.id}>
                      <Link
                        href={`${base}/incidents/${incident.id}${home.incidentsScope === "laboratory" ? "?scope=laboratory" : ""}`}
                        className="flex items-center gap-3 px-4 py-3 hover:bg-paper"
                      >
                        <span
                          className={`size-2 flex-none rounded-full ${incident.severity === "high" ? "bg-red-600" : incident.severity === "medium" ? "bg-pending" : "bg-muted"}`}
                          aria-hidden
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-semibold">
                            {incident.targetSnapshot.name}
                          </span>
                          <span className="block text-sm text-muted">
                            Severidad{" "}
                            {severityLabels[incident.severity].toLowerCase()},{" "}
                            {statusLabels[incident.status].toLowerCase()}
                          </span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Box>
          ) : null}

          {home.loans ? (
            <Box
              title={
                home.loansScope === "laboratory"
                  ? "Préstamos activos"
                  : "Tus préstamos"
              }
              icon={ArrowRightLeft}
              action={{ href: `${base}/loans`, label: "Ver todos" }}
            >
              {home.loans.length === 0 ? (
                <Empty>
                  {home.loansScope === "laboratory"
                    ? "No hay herramientas prestadas."
                    : "No tienes herramientas prestadas."}
                </Empty>
              ) : (
                <ul className="divide-y divide-line">
                  {home.loans.slice(0, 4).map((loan) => (
                    <li
                      key={loan.id}
                      className="flex items-center gap-3 px-4 py-3"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">
                          {loan.itemName}
                        </span>
                        <span className="block text-sm text-muted">
                          {home.loansScope === "laboratory"
                            ? `${loan.borrowerName}, ${loan.outstanding} pendiente`
                            : `${loan.outstanding} por devolver`}
                        </span>
                      </span>
                      {loan.overdue ? (
                        <span className="rounded-full border border-red-300 px-2 text-xs font-semibold text-red-700">
                          Vencido
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </Box>
          ) : null}
        </div>

        {!home.academic && !home.incidents && !home.loans ? (
          <div className="box">
            <Empty>
              Aún no tienes actividades en este laboratorio. Pide a tu profesor
              que revise tu rol.
            </Empty>
          </div>
        ) : null}
      </div>
    </div>
  );
}
