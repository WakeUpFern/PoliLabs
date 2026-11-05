"use client";

import Link from "next/link";
import { useState } from "react";
import {
  entriesForDay,
  formatCalendarDay,
  formatCalendarTime,
} from "@/modules/reservations/web/calendar";
import type { OccupancyView } from "@/modules/reservations/web/reservation-web";

const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

/**
 * Month overview. Choosing a day marks it and lists its reservations as cards
 * under the month, so a phone reads a day without leaving the month; the
 * cards link to each reservation and to the day's grid to book.
 */
export function MonthCalendar({
  slug,
  month,
  today,
  days,
  entries,
  dayHrefs,
  canCreate,
}: {
  slug: string;
  month: string;
  today: string;
  days: string[];
  entries: OccupancyView[];
  dayHrefs: Record<string, string>;
  canCreate: boolean;
}) {
  const [selected, setSelected] = useState(
    today.startsWith(month) ? today : `${month}-01`,
  );
  const selectedEntries = entriesForDay(entries, selected).sort(
    (a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt),
  );

  return (
    <div>
      <div className="overflow-hidden rounded-md border border-line bg-line">
        <div className="grid grid-cols-7 gap-px text-center text-sm font-semibold text-muted max-sm:text-xs">
          {WEEKDAYS.map((day) => (
            <div key={day} className="bg-paper py-2">
              {day}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-px">
          {days.map((day) => {
            const dayEntries = entriesForDay(entries, day);
            const inMonth = day.startsWith(month);
            const isSelected = day === selected;
            return (
              <section
                key={day}
                aria-label={formatCalendarDay(day, "long")}
                className={`relative min-h-14 p-1 sm:min-h-28 sm:p-2 ${
                  inMonth ? "bg-surface" : "bg-paper text-muted"
                } ${isSelected ? "z-10 outline-2 -outline-offset-2 outline-guinda" : ""}`}
              >
                <button
                  type="button"
                  onClick={() => setSelected(day)}
                  aria-pressed={isSelected}
                  aria-label={`${formatCalendarDay(day, "long")}${
                    dayEntries.length
                      ? `, ${dayEntries.length} ${dayEntries.length === 1 ? "reservación" : "reservaciones"}`
                      : ""
                  }`}
                  // The whole cell is the target on a phone.
                  className="absolute inset-0 flex cursor-pointer items-start justify-center sm:static sm:inline-flex sm:size-7 sm:items-center sm:justify-center sm:rounded-full"
                >
                  <span
                    className={`mx-auto mt-1 grid size-7 place-items-center rounded-full text-sm font-semibold sm:m-0 ${
                      day === today ? "bg-guinda text-white" : ""
                    }`}
                  >
                    {Number(day.slice(8))}
                  </span>
                </button>
                {/* Phones mark each reservation with a short bar, up to three. */}
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-x-1.5 top-9 flex flex-col gap-0.5 sm:hidden"
                >
                  {dayEntries.slice(0, 3).map((entry, index) => (
                    <span
                      key={`${entry.startsAt}-${index}`}
                      className={`h-1 rounded-full ${entry.isMine ? "bg-guinda" : "bg-stone-400"}`}
                    />
                  ))}
                </div>
                <ul className="mt-1 hidden space-y-1 sm:block">
                  {dayEntries.slice(0, 3).map((entry, index) => (
                    <li key={`${entry.startsAt}-${index}`}>
                      <EntryChip slug={slug} entry={entry} />
                    </li>
                  ))}
                  {dayEntries.length > 3 && (
                    <li>
                      <button
                        type="button"
                        onClick={() => setSelected(day)}
                        className="cursor-pointer text-xs font-semibold text-guinda"
                      >
                        +{dayEntries.length - 3} más
                      </button>
                    </li>
                  )}
                </ul>
              </section>
            );
          })}
        </div>
      </div>

      <section aria-labelledby="month-agenda-title" className="mt-5">
        <div className="flex items-baseline justify-between gap-3">
          <h3
            id="month-agenda-title"
            aria-live="polite"
            className="flex items-baseline gap-2 font-semibold"
          >
            <span className="text-3xl leading-none">
              {Number(selected.slice(8))}
            </span>
            <span className="text-sm text-muted first-letter:uppercase">
              {agendaLabel(selected)}
            </span>
          </h3>
          <Link
            href={dayHrefs[selected]}
            className="text-sm font-semibold whitespace-nowrap text-guinda underline-offset-4 hover:underline"
          >
            {canCreate ? "Reservar en este horario" : "Ver horario completo"}
          </Link>
        </div>
        {selectedEntries.length ? (
          <ul className="mt-3 space-y-2">
            {selectedEntries.map((entry, index) => (
              <li key={`${entry.startsAt}-${index}`}>
                <AgendaCard slug={slug} entry={entry} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 empty-state">Sin reservaciones este día.</p>
        )}
      </section>
    </div>
  );
}

// "jueves · noviembre", beside the big day number.
function agendaLabel(date: string) {
  const format = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("es-MX", { timeZone: "UTC", ...options }).format(
      new Date(`${date}T00:00:00Z`),
    );
  return `${format({ weekday: "long" })} · ${format({ month: "long" })}`;
}

function timeRange(entry: OccupancyView) {
  return `${formatCalendarTime(entry.startsAt)}–${formatCalendarTime(entry.endsAt)}`;
}

function tone(entry: OccupancyView) {
  return entry.isMine
    ? "border-guinda/30 bg-guinda-tint text-guinda-deep"
    : "border-line bg-paper text-muted";
}

function AgendaCard({ slug, entry }: { slug: string; entry: OccupancyView }) {
  const body = (
    <>
      <span className="w-28 flex-none font-semibold whitespace-nowrap tabular-nums">
        {timeRange(entry)}
      </span>
      <span className="min-w-0">
        <span className="block font-semibold">
          {entry.isMine ? "Mi reservación" : "Ocupado"}
        </span>
        <span className="block truncate text-sm">{entry.target}</span>
      </span>
    </>
  );
  const className = `flex items-start gap-3 rounded-md border px-3 py-2.5 ${tone(entry)}`;
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

function EntryChip({ slug, entry }: { slug: string; entry: OccupancyView }) {
  const body = (
    <>
      <span className="block font-semibold">{timeRange(entry)}</span>
      <span className="block truncate">
        {entry.isMine ? "Mi reservación" : "Ocupado"} · {entry.target}
      </span>
    </>
  );
  const className = `block rounded border px-2 py-1 text-xs ${tone(entry)}`;
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
