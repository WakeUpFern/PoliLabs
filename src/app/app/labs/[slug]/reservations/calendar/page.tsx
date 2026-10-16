import Link from "next/link";
import { notFound } from "next/navigation";
import { AuthorizationDeniedError } from "@/modules/identity/domain/access-errors";
import {
  CALENDAR_VIEWS,
  entriesForDay,
  formatCalendarDay,
  formatCalendarTime,
  formatCalendarTitle,
  type CalendarView,
} from "@/modules/reservations/web/calendar";
import type { OccupancyView } from "@/modules/reservations/web/reservation-web";
import { reservationWeb } from "@/modules/reservations/web/services";

const viewLabels: Record<CalendarView, string> = {
  day: "Día",
  week: "Semana",
  month: "Mes",
};
const inputStyle =
  "min-h-11 w-full rounded-xl border border-stone-300 bg-white px-3 focus:outline-none focus:ring-4 focus:ring-[#7a1731]/20";

export default async function ReservationCalendarPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  let data;
  try {
    data = await reservationWeb.calendar(slug, query);
  } catch (error) {
    if (error instanceof AuthorizationDeniedError) notFound();
    throw error;
  }
  const href = (changes: { view?: CalendarView; date?: string }) => {
    const search = new URLSearchParams({
      view: changes.view ?? data.view,
      date: changes.date ?? data.date,
    });
    if (data.space) search.set("space", data.space.id);
    if (data.resource) search.set("resource", data.resource.id);
    return `/app/labs/${slug}/reservations/calendar?${search}`;
  };
  const title = formatCalendarTitle(data.view, data.date, data.days);
  const month = data.date.slice(0, 7);

  return (
    <div>
      <Link
        href={`/app/labs/${slug}/reservations`}
        className="text-sm font-semibold text-[#7a1731]"
      >
        ← Mis reservaciones
      </Link>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">
            Calendario de reservaciones
          </h1>
          <p className="mt-3 text-stone-600">
            {data.laboratory.name} · Horarios en America/Mexico_City. Las
            reservaciones de otras personas aparecen como ocupadas, sin datos de
            quién reservó.
          </p>
        </div>
        {data.canCreate && (
          <Link
            href={`/app/labs/${slug}/reservations/new`}
            className="rounded-xl bg-[#7a1731] px-5 py-3 font-semibold text-white"
          >
            Nueva reservación
          </Link>
        )}
      </div>

      {!data.space ? (
        <p className="mt-8 rounded-2xl border border-dashed border-stone-300 bg-stone-50 p-8 text-stone-600">
          No hay espacios activos visibles para mostrar un calendario.
        </p>
      ) : (
        <>
          <form
            method="get"
            className="mt-8 grid gap-4 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:grid-cols-[1fr_1fr_auto] sm:items-end"
          >
            <input type="hidden" name="view" value={data.view} />
            <input type="hidden" name="date" value={data.date} />
            <div>
              <label htmlFor="space" className="mb-2 block font-semibold">
                Espacio
              </label>
              <select
                id="space"
                name="space"
                defaultValue={data.space.id}
                className={inputStyle}
              >
                {data.spaces.map((space) => (
                  <option key={space.id} value={space.id}>
                    {space.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="resource" className="mb-2 block font-semibold">
                Recurso
              </label>
              <select
                id="resource"
                name="resource"
                defaultValue={data.resource?.id ?? ""}
                className={inputStyle}
              >
                <option value="">Todo el espacio</option>
                {data.space.resources.map((resource) => (
                  <option key={resource.id} value={resource.id}>
                    {resource.name}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              className="min-h-11 rounded-xl bg-[#7a1731] px-5 font-semibold text-white"
            >
              Mostrar
            </button>
          </form>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
            <nav aria-label="Periodo" className="flex flex-wrap gap-2">
              <Link
                href={href({ date: data.previous })}
                className="rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-semibold"
              >
                <span aria-hidden="true">←</span> Anterior
              </Link>
              <Link
                href={href({ date: data.today })}
                className="rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-semibold"
              >
                Hoy
              </Link>
              <Link
                href={href({ date: data.next })}
                className="rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-semibold"
              >
                Siguiente <span aria-hidden="true">→</span>
              </Link>
            </nav>
            <nav
              aria-label="Vista"
              className="flex gap-1 rounded-xl bg-stone-100 p-1"
            >
              {CALENDAR_VIEWS.map((view) => (
                <Link
                  key={view}
                  href={href({ view })}
                  aria-current={view === data.view ? "page" : undefined}
                  className={`rounded-lg px-4 py-2 text-sm font-semibold ${
                    view === data.view
                      ? "bg-white text-[#7a1731] shadow-sm"
                      : "text-stone-600"
                  }`}
                >
                  {viewLabels[view]}
                </Link>
              ))}
            </nav>
          </div>

          <h2 className="mt-6 text-xl font-semibold first-letter:uppercase">
            {title}
            <span className="ml-2 text-base font-normal text-stone-500">
              · {data.resource?.name ?? data.space.name}
            </span>
          </h2>

          {data.view === "month" ? (
            <div className="mt-4 overflow-hidden rounded-2xl border border-stone-200 bg-stone-200">
              <div className="grid grid-cols-7 gap-px text-center text-xs font-semibold uppercase text-stone-500">
                {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map(
                  (day) => (
                    <div key={day} className="bg-stone-50 py-2">
                      {day}
                    </div>
                  ),
                )}
              </div>
              <div className="grid grid-cols-7 gap-px">
                {data.days.map((day) => {
                  const entries = entriesForDay(data.entries, day);
                  return (
                    <section
                      key={day}
                      aria-label={formatCalendarDay(day, "long")}
                      className={`min-h-20 p-1.5 sm:min-h-28 sm:p-2 ${
                        day.startsWith(month)
                          ? "bg-white"
                          : "bg-stone-50 text-stone-400"
                      }`}
                    >
                      <Link
                        href={href({ view: "day", date: day })}
                        className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold ${
                          day === data.today ? "bg-[#7a1731] text-white" : ""
                        }`}
                      >
                        {Number(day.slice(8))}
                      </Link>
                      {entries.length > 0 && (
                        <p className="mt-1 rounded-md bg-[#7a1731]/10 px-1 text-center text-xs font-semibold text-[#7a1731] sm:hidden">
                          {entries.length}
                        </p>
                      )}
                      <ul className="mt-1 hidden space-y-1 sm:block">
                        {entries.slice(0, 3).map((entry, index) => (
                          <li key={`${entry.startsAt}-${index}`}>
                            <EntryChip slug={slug} entry={entry} compact />
                          </li>
                        ))}
                        {entries.length > 3 && (
                          <li>
                            <Link
                              href={href({ view: "day", date: day })}
                              className="text-xs font-semibold text-[#7a1731]"
                            >
                              +{entries.length - 3} más
                            </Link>
                          </li>
                        )}
                      </ul>
                    </section>
                  );
                })}
              </div>
            </div>
          ) : (
            <div
              className={`mt-4 grid gap-3 ${
                data.view === "week" ? "md:grid-cols-7" : ""
              }`}
            >
              {data.days.map((day) => {
                const entries = entriesForDay(data.entries, day);
                return (
                  <section
                    key={day}
                    aria-label={formatCalendarDay(day, "long")}
                    className={`rounded-2xl border bg-white p-3 ${
                      day === data.today
                        ? "border-[#7a1731]"
                        : "border-stone-200"
                    }`}
                  >
                    <h3 className="text-sm font-semibold capitalize">
                      {formatCalendarDay(
                        day,
                        data.view === "day" ? "long" : "short",
                      )}
                    </h3>
                    {entries.length === 0 ? (
                      <p className="mt-2 text-xs text-stone-500">
                        Sin reservaciones
                      </p>
                    ) : (
                      <ul className="mt-2 space-y-2">
                        {entries.map((entry, index) => (
                          <li key={`${entry.startsAt}-${index}`}>
                            <EntryChip slug={slug} entry={entry} />
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                );
              })}
            </div>
          )}
          <p className="mt-4 flex flex-wrap gap-4 text-sm text-stone-600">
            <span className="inline-flex items-center gap-2">
              <span className="h-3 w-3 rounded-sm bg-[#7a1731]" /> Mis
              reservaciones
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="h-3 w-3 rounded-sm bg-stone-400" /> Ocupado por
              otra persona
            </span>
          </p>
        </>
      )}
    </div>
  );
}

function EntryChip({
  slug,
  entry,
  compact = false,
}: {
  slug: string;
  entry: OccupancyView;
  compact?: boolean;
}) {
  const time = `${formatCalendarTime(entry.startsAt)}–${formatCalendarTime(entry.endsAt)}`;
  const tone = entry.isMine
    ? "border-[#7a1731] bg-[#7a1731]/10 text-[#641229]"
    : "border-stone-300 bg-stone-100 text-stone-700";
  const body = (
    <>
      <span className="block font-semibold">{time}</span>
      <span className={compact ? "block truncate" : "block"}>
        {entry.isMine ? "Mi reservación" : "Ocupado"} · {entry.target}
      </span>
    </>
  );
  const className = `block rounded-lg border-l-4 px-2 py-1 text-xs ${tone}`;
  return entry.reservationId ? (
    <Link
      href={`/app/labs/${slug}/reservations/${entry.reservationId}`}
      className={className}
    >
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}
