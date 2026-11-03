import { Temporal } from "temporal-polyfill";

// The interface states wall times of the laboratory; services receive instants
// with an offset. Never parse a bare local timestamp in the process/browser zone.
export const TIME_ZONE = "America/Mexico_City";

function zoned(instant: Date | string | number) {
  return Temporal.Instant.fromEpochMilliseconds(
    new Date(instant).getTime(),
  ).toZonedDateTimeISO(TIME_ZONE);
}

// datetime-local value (YYYY-MM-DDTHH:mm) → ISO instant. Nonexistent or
// ambiguous wall times (DST gaps and overlaps) are rejected, never guessed.
export function localToInstant(value: string, invalid: () => Error): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw invalid();
  try {
    const instant = Temporal.PlainDateTime.from(value, {
      overflow: "reject",
    }).toZonedDateTime(TIME_ZONE, { disambiguation: "reject" });
    return new Date(instant.epochMilliseconds).toISOString();
  } catch (error) {
    if (error instanceof RangeError) throw invalid();
    throw error;
  }
}

// datetime-local value (minutes) of an instant.
export function instantToLocal(instant: Date | string | number) {
  return zoned(instant).toPlainDateTime().toString({ smallestUnit: "minute" });
}

// YYYY-MM-DD wall date of an instant.
export function localDate(instant: Date | string | number) {
  return zoned(instant).toPlainDate().toString();
}

export function addDays(date: string, days: number) {
  return Temporal.PlainDate.from(date).add({ days }).toString();
}

const timeFormatter = new Intl.DateTimeFormat("es-MX", {
  timeZone: TIME_ZONE,
  dateStyle: "medium",
  timeStyle: "short",
  hourCycle: "h23",
});
export function formatTime(value: string | Date) {
  return timeFormatter.format(new Date(value));
}
