import Link from "next/link";
import {
  entriesForDay,
  formatCalendarDay,
  formatCalendarTime,
} from "@/modules/reservations/web/calendar";
import type { OccupancyView } from "@/modules/reservations/web/reservation-web";

// Read-only month overview; each day links to the interactive day grid.
export function MonthCalendar({
  slug,
  month,
  today,
  days,
  entries,
  dayHref,
}: {
  slug: string;
  month: string;
  today: string;
  days: string[];
  entries: OccupancyView[];
  dayHref: (date: string) => string;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-stone-200 bg-stone-200">
      <div className="grid grid-cols-7 gap-px text-center text-xs font-semibold uppercase text-stone-500">
        {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((day) => (
          <div key={day} className="bg-stone-50 py-2">
            {day}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-px">
        {days.map((day) => {
          const dayEntries = entriesForDay(entries, day);
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
                href={dayHref(day)}
                aria-label={`Ver ${formatCalendarDay(day, "long")}`}
                className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold ${
                  day === today ? "bg-[#7a1731] text-white" : ""
                }`}
              >
                {Number(day.slice(8))}
              </Link>
              {dayEntries.length > 0 && (
                <p className="mt-1 rounded-md bg-[#7a1731]/10 px-1 text-center text-xs font-semibold text-[#7a1731] sm:hidden">
                  {dayEntries.length}
                </p>
              )}
              <ul className="mt-1 hidden space-y-1 sm:block">
                {dayEntries.slice(0, 3).map((entry, index) => (
                  <li key={`${entry.startsAt}-${index}`}>
                    <EntryChip slug={slug} entry={entry} />
                  </li>
                ))}
                {dayEntries.length > 3 && (
                  <li>
                    <Link
                      href={dayHref(day)}
                      className="text-xs font-semibold text-[#7a1731]"
                    >
                      +{dayEntries.length - 3} más
                    </Link>
                  </li>
                )}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function EntryChip({ slug, entry }: { slug: string; entry: OccupancyView }) {
  const time = `${formatCalendarTime(entry.startsAt)}–${formatCalendarTime(entry.endsAt)}`;
  const tone = entry.isMine
    ? "border-[#7a1731] bg-[#7a1731]/10 text-[#641229]"
    : "border-stone-300 bg-stone-100 text-stone-700";
  const body = (
    <>
      <span className="block font-semibold">{time}</span>
      <span className="block truncate">
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
