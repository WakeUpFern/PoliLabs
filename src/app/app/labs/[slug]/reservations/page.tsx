import Link from "next/link";
import { notFound } from "next/navigation";
import { AuthorizationDeniedError } from "@/modules/identity/domain/access-errors";
import { addDays } from "@/shared/time";
import {
  CALENDAR_VIEWS,
  dayStart,
  formatCalendarDay,
  formatCalendarTitle,
  type CalendarView,
} from "@/modules/reservations/web/calendar";
import { reservationWeb } from "@/modules/reservations/web/services";
import { gridReservationAction } from "./actions";
import { MonthCalendar } from "./month-calendar";
import { CalendarFilters } from "./calendar-filters";
import { MyReservations } from "./my-reservations";
import { ReservationGrid, type GridDay } from "./reservation-grid";

const viewLabels: Record<CalendarView, string> = {
  day: "Día",
  week: "Semana",
  month: "Mes",
};
const inputStyle =
  "min-h-11 w-full rounded-md border border-line bg-surface px-3 focus:outline-none focus:ring-4 focus:ring-guinda/20";

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
  const canCreate = (data ?? list)!.canCreate;

  return (
    <div>
      <h1 className="text-2xl font-semibold sm:text-3xl">Reservaciones</h1>
      <nav
        aria-label="Secciones de reservaciones"
        className="mt-4 flex gap-1 border-b border-line"
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
                ? "border-guinda text-guinda"
                : "border-transparent text-muted"
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
        data && (
          <Calendar
            slug={slug}
            base={base}
            data={data}
            query={query}
            canCreate={canCreate}
          />
        )
      )}
    </div>
  );
}

function Calendar({
  slug,
  base,
  data,
  query,
  canCreate,
}: {
  slug: string;
  base: string;
  data: Awaited<ReturnType<typeof reservationWeb.calendar>>;
  query: Record<string, string | string[] | undefined>;
  canCreate: boolean;
}) {
  const { space } = data;
  if (!space)
    return (
      <p className="mt-8 rounded-md border border-dashed border-line bg-paper p-8 text-muted">
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
  const linkStyle = "btn";

  return (
    <>
      <div className="mt-5">
        <CalendarFilters>
          <input type="hidden" name="view" value={data.view} />
          <input type="hidden" name="date" value={data.date} />
          <div>
            <label
              htmlFor="space"
              className="mb-1.5 block text-sm font-semibold"
            >
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
            <label
              htmlFor="resource"
              className="mb-1.5 block text-sm font-semibold"
            >
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
        </CalendarFilters>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
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
          className="flex gap-1 rounded-md border border-line bg-paper p-1"
        >
          {CALENDAR_VIEWS.map((view) => (
            <Link
              key={view}
              href={href({ view })}
              aria-current={view === data.view ? "page" : undefined}
              className={`grid min-h-9 place-items-center rounded px-4 text-sm font-semibold max-lg:min-h-11 ${
                view === data.view
                  ? "bg-surface text-guinda shadow-sm"
                  : "text-muted"
              }`}
            >
              {viewLabels[view]}
            </Link>
          ))}
        </nav>
      </div>

      <h2 className="mt-5 mb-3 text-lg font-semibold first-letter:uppercase">
        {formatCalendarTitle(data.view, data.date, data.days)}
        <span className="ml-2 text-base font-normal text-muted">
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
      <div className="mt-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-sm text-muted">
        <p className="flex flex-wrap gap-x-4 gap-y-1">
          <span className="inline-flex items-center gap-2">
            <span className="h-3 w-3 rounded-sm bg-guinda" /> Mis reservaciones
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-3 w-3 rounded-sm bg-stone-400" /> Ocupado (no se
            muestra quién reservó)
          </span>
          <span>Hora del centro de México.</span>
        </p>
        {canCreate && (
          <Link
            href={`${base}/new`}
            className="font-semibold text-guinda underline-offset-4 hover:underline"
          >
            Reservar con formulario
          </Link>
        )}
      </div>
    </>
  );
}
