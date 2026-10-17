import Link from "next/link";
import { notFound } from "next/navigation";
import { AuthorizationDeniedError } from "@/modules/identity/domain/access-errors";
import {
  addDays,
  CALENDAR_VIEWS,
  dayStart,
  formatCalendarDay,
  formatCalendarTitle,
  type CalendarView,
} from "@/modules/reservations/web/calendar";
import { reservationWeb } from "@/modules/reservations/web/services";
import { gridReservationAction } from "./actions";
import { MonthCalendar } from "./month-calendar";
import { MyReservations } from "./my-reservations";
import { ReservationGrid, type GridDay } from "./reservation-grid";

const viewLabels: Record<CalendarView, string> = {
  day: "Día",
  week: "Semana",
  month: "Mes",
};
const inputStyle =
  "min-h-11 w-full rounded-xl border border-stone-300 bg-white px-3 focus:outline-none focus:ring-4 focus:ring-[#7a1731]/20";

// Reservaciones opens on the interactive calendar (ADR 0021); "Mis
// reservaciones" stays as a list tab and the form remains at /new.
export default async function ReservationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const base = `/app/labs/${slug}/reservations`;
  const mine = query.tab === "mine";
  let data;
  let list;
  try {
    if (mine) list = await reservationWeb.list(slug);
    else data = await reservationWeb.calendar(slug, query);
  } catch (error) {
    if (error instanceof AuthorizationDeniedError) notFound();
    throw error;
  }
  const laboratory = (data ?? list)!.laboratory;
  const canCreate = (data ?? list)!.canCreate;

  return (
    <div>
      <Link
        href={`/app/labs/${slug}`}
        className="text-sm font-semibold text-[#7a1731]"
      >
        ← {laboratory.name}
      </Link>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Reservaciones</h1>
          <p className="mt-3 text-stone-600">
            {laboratory.name} · Horarios en America/Mexico_City. Las
            reservaciones de otras personas aparecen como ocupadas, sin datos de
            quién reservó.
          </p>
        </div>
        {canCreate && (
          <Link
            href={`${base}/new`}
            className="text-sm font-semibold text-[#7a1731] underline-offset-4 hover:underline"
          >
            Usar el formulario
          </Link>
        )}
      </div>
      <nav
        aria-label="Secciones de reservaciones"
        className="mt-6 flex gap-1 border-b border-stone-200"
      >
        {[
          { label: "Calendario", href: base, current: !mine },
          {
            label: "Mis reservaciones",
            href: `${base}?tab=mine`,
            current: mine,
          },
        ].map((tab) => (
          <Link
            key={tab.label}
            href={tab.href}
            aria-current={tab.current ? "page" : undefined}
            className={`-mb-px border-b-2 px-4 py-2 font-semibold ${
              tab.current
                ? "border-[#7a1731] text-[#7a1731]"
                : "border-transparent text-stone-600"
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </nav>
      {list ? (
        <MyReservations
          slug={slug}
          now={list.now}
          canCreate={list.canCreate}
          reservations={list.reservations}
        />
      ) : (
        data && <Calendar slug={slug} base={base} data={data} query={query} />
      )}
    </div>
  );
}

function Calendar({
  slug,
  base,
  data,
  query,
}: {
  slug: string;
  base: string;
  data: Awaited<ReturnType<typeof reservationWeb.calendar>>;
  query: Record<string, string | string[] | undefined>;
}) {
  const { space } = data;
  if (!space)
    return (
      <p className="mt-8 rounded-2xl border border-dashed border-stone-300 bg-stone-50 p-8 text-stone-600">
        No hay espacios activos visibles para mostrar un calendario.
      </p>
    );
  const href = (changes: { view?: CalendarView; date?: string }) => {
    const search = new URLSearchParams({
      view: changes.view ?? data.view,
      date: changes.date ?? data.date,
    });
    search.set("space", space.id);
    if (data.resource) search.set("resource", data.resource.id);
    return `${base}?${search}`;
  };
  const days: GridDay[] = data.days.map((date) => ({
    date,
    start: dayStart(date),
    end: dayStart(addDays(date, 1)),
    label: formatCalendarDay(date, "long"),
    shortLabel: formatCalendarDay(date, "short"),
    isToday: date === data.today,
  }));
  const linkStyle =
    "rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-semibold";

  return (
    <>
      <form
        method="get"
        className="mt-6 grid gap-4 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:grid-cols-[1fr_1fr_auto] sm:items-end"
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
            defaultValue={space.id}
            className={inputStyle}
          >
            {data.spaces.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
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
            {space.resources.map((resource) => (
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
          <Link href={href({ date: data.previous })} className={linkStyle}>
            <span aria-hidden="true">←</span> Anterior
          </Link>
          <Link href={href({ date: data.today })} className={linkStyle}>
            Hoy
          </Link>
          <Link href={href({ date: data.next })} className={linkStyle}>
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

      <h2 className="mt-6 mb-4 text-xl font-semibold first-letter:uppercase">
        {formatCalendarTitle(data.view, data.date, data.days)}
        <span className="ml-2 text-base font-normal text-stone-500">
          · {data.resource?.name ?? space.name}
        </span>
      </h2>

      {data.view === "month" ? (
        <MonthCalendar
          slug={slug}
          month={data.date.slice(0, 7)}
          today={data.today}
          days={data.days}
          entries={data.entries}
          dayHref={(date) => href({ view: "day", date })}
        />
      ) : (
        <ReservationGrid
          key={`${space.id}-${data.view}-${data.days[0]}`}
          slug={slug}
          days={days}
          entries={data.entries}
          spaceEntries={data.spaceEntries}
          space={space}
          resourceId={data.resource?.id ?? null}
          canCreate={data.canCreate}
          now={data.now}
          autoDayHref={query.view === undefined ? href({ view: "day" }) : null}
          action={gridReservationAction.bind(null, slug)}
        />
      )}
      <p className="mt-4 flex flex-wrap gap-4 text-sm text-stone-600">
        <span className="inline-flex items-center gap-2">
          <span className="h-3 w-3 rounded-sm bg-[#7a1731]" /> Mis reservaciones
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-3 w-3 rounded-sm bg-stone-400" /> Ocupado por otra
          persona
        </span>
      </p>
    </>
  );
}
