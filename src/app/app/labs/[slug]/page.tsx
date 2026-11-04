import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCurrentActor } from "@/app/_lib/current-actor";
import { getLaboratoryBySlug } from "@/modules/identity/infrastructure/services";
import { AuthorizationDeniedError } from "@/modules/identity/domain/access-errors";
import { LABORATORY_ROLE_CATALOG } from "@/modules/identity/domain/access-catalog";
import { addDays, localDate, TIME_ZONE } from "@/shared/time";
import { laboratoryHome } from "./home-data";
import { severityLabels, statusLabels } from "./incidents/labels";

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

function sessionDay(startsAt: Date, now: Date) {
  const key = localDate(startsAt);
  if (key === localDate(now)) return "Hoy";
  if (key === addDays(localDate(now), 1)) return "Mañana";
  return day.format(startsAt);
}

function Box({
  title,
  action,
  children,
}: {
  title: string;
  action?: { href: string; label: string };
  children: React.ReactNode;
}) {
  return (
    <section className="box overflow-hidden">
      <div className="flex items-center gap-2 border-b border-line px-4 py-3">
        <h2 className="flex-1 font-semibold">{title}</h2>
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
  return <div className="px-4 py-5 text-muted">{children}</div>;
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
  const count = (n: number, one: string, many: string) =>
    `${n} ${n === 1 ? one : many}`;
  // What waits today, in the same words as the boxes below.
  const summary = [
    home.academic
      ? count(
          home.academic.sessions.length,
          "sesión próxima",
          "sesiones próximas",
        )
      : null,
    home.incidents && home.incidentsScope === "laboratory"
      ? count(
          home.incidents.length,
          "incidencia por atender",
          "incidencias por atender",
        )
      : null,
    home.loans && home.loansScope === "laboratory"
      ? count(home.loans.length, "préstamo activo", "préstamos activos")
      : null,
  ].filter((part): part is string => part !== null);

  // The one action that starts the usual work of this person.
  const primary = teaches
    ? { href: `${base}/academic/practices/new`, label: "Nueva práctica" }
    : can("reservation.create")
      ? { href: `${base}/reservations`, label: "Reservar equipo" }
      : null;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold">Inicio</h1>
          <p className="mt-0.5 text-muted">
            {[
              roleNames.length > 0 ? roleNames.join(", ") : "Sin rol",
              ...summary,
            ].join(" · ")}
          </p>
        </div>
        {primary ? (
          <Link href={primary.href} className="btn btn-primary max-sm:w-full">
            {primary.label}
          </Link>
        ) : null}
      </header>

      <div className="flex min-w-0 flex-col gap-6">
        {home.academic ? (
          <Box
            title="Tus próximas sesiones"
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
                        <span className="rounded-full bg-red-50 px-2.5 py-0.5 text-[0.8125rem] font-semibold text-red-800">
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
