import { localToInstant, RESERVATION_TIME_ZONE } from "./time";

// Calendar days are wall dates in the interface time zone (ADR 0009); every
// boundary is converted with localToInstant, never with the process zone.
export const CALENDAR_VIEWS = ["day", "week", "month"] as const;
export type CalendarView = (typeof CALENDAR_VIEWS)[number];

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const dayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: RESERVATION_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function utc(date: string) {
  return new Date(`${date}T00:00:00Z`);
}
function iso(date: Date) {
  return date.toISOString().slice(0, 10);
}
export function addDays(date: string, days: number) {
  const value = utc(date);
  value.setUTCDate(value.getUTCDate() + days);
  return iso(value);
}
function isDate(value: unknown): value is string {
  return (
    typeof value === "string" && DATE.test(value) && iso(utc(value)) === value
  );
}

export function localDate(instant: Date | string | number) {
  return dayFormatter.format(new Date(instant));
}

export function parseCalendarQuery(
  query: { view?: unknown; date?: unknown },
  now: Date,
): { view: CalendarView; date: string } {
  const view = CALENDAR_VIEWS.includes(query.view as CalendarView)
    ? (query.view as CalendarView)
    : "week";
  return { view, date: isDate(query.date) ? query.date : localDate(now) };
}

// Weeks start on Monday; a month shows the whole weeks that contain it.
export function calendarDays(view: CalendarView, date: string): string[] {
  if (view === "day") return [date];
  const mondayOf = (day: string) =>
    addDays(day, -((utc(day).getUTCDay() + 6) % 7));
  if (view === "week")
    return Array.from({ length: 7 }, (_, i) => addDays(mondayOf(date), i));
  const first = `${date.slice(0, 7)}-01`;
  const next = utc(first);
  next.setUTCMonth(next.getUTCMonth() + 1);
  const last = addDays(iso(next), -1);
  const days = [];
  for (
    let day = mondayOf(first);
    days.length === 0 || day <= addDays(mondayOf(last), 6);
    day = addDays(day, 1)
  )
    days.push(day);
  return days;
}

export function dayStart(date: string) {
  return localToInstant(`${date}T00:00`);
}

export function calendarWindow(days: readonly string[]) {
  return {
    startsAt: dayStart(days[0]),
    endsAt: dayStart(addDays(days[days.length - 1], 1)),
  };
}

export function shiftCalendarDate(
  view: CalendarView,
  date: string,
  direction: 1 | -1,
) {
  if (view === "day") return addDays(date, direction);
  if (view === "week") return addDays(date, 7 * direction);
  const value = utc(`${date.slice(0, 7)}-01`);
  value.setUTCMonth(value.getUTCMonth() + direction);
  return iso(value);
}

// An entry spanning midnight appears on every day it overlaps.
export function entriesForDay<T extends { startsAt: string; endsAt: string }>(
  entries: readonly T[],
  date: string,
) {
  const start = Date.parse(dayStart(date));
  const end = Date.parse(dayStart(addDays(date, 1)));
  return entries.filter(
    (entry) =>
      Date.parse(entry.startsAt) < end && Date.parse(entry.endsAt) > start,
  );
}

export function formatCalendarTime(value: string | Date) {
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: RESERVATION_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value));
}

export function formatCalendarDay(date: string, style: "short" | "long") {
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: "UTC",
    ...(style === "long"
      ? { weekday: "long", day: "numeric", month: "long", year: "numeric" }
      : { weekday: "short", day: "numeric" }),
  }).format(utc(date));
}

export function formatCalendarTitle(
  view: CalendarView,
  date: string,
  days: readonly string[],
) {
  const format = (date: string, options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("es-MX", { timeZone: "UTC", ...options }).format(
      utc(date),
    );
  if (view === "day") return formatCalendarDay(days[0], "long");
  if (view === "week")
    return `${format(days[0], { day: "numeric", month: "short" })} – ${format(days[6], { day: "numeric", month: "short", year: "numeric" })}`;
  return format(date, { month: "long", year: "numeric" });
}

const dateTimeFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: RESERVATION_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

// datetime-local value (minutes) of an instant in the interface time zone.
export function localDateTime(instant: Date | string | number) {
  const parts = Object.fromEntries(
    dateTimeFormatter
      .formatToParts(new Date(instant))
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

// Default plan interval: the next whole hour, one hour long.
export function nextHourInterval(now: Date) {
  const start = Math.ceil(now.getTime() / 3_600_000) * 3_600_000;
  return {
    startsLocal: localDateTime(start),
    endsLocal: localDateTime(start + 3_600_000),
  };
}
