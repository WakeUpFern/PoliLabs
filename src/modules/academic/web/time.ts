import { AcademicError } from "../domain/academic";

export const ACADEMIC_TIME_ZONE = "America/Mexico_City";
const partsFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: ACADEMIC_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});
function wallTime(instant: number) {
  const parts = Object.fromEntries(
    partsFormatter.formatToParts(instant).map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
}
// Resolve IANA offsets around the chosen date, then round-trip each candidate.
// Never parse a bare local timestamp in the process/browser timezone.
export function localToInstant(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))
    throw new AcademicError("input");
  const local = `${value}:00`;
  const nominal = Date.parse(`${local}Z`);
  if (
    !Number.isFinite(nominal) ||
    new Date(nominal).toISOString().slice(0, 19) !== local
  )
    throw new AcademicError("input");
  const offsets = new Set<number>();
  for (let hours = -36; hours <= 36; hours += 6) {
    const sample = nominal + hours * 3600000;
    offsets.add(Date.parse(`${wallTime(sample)}Z`) - sample);
  }
  const candidates = [...offsets]
    .map((offset) => nominal - offset)
    .filter((instant) => wallTime(instant) === local);
  // Reject nonexistent or ambiguous historical wall times instead of guessing.
  if (candidates.length !== 1) throw new AcademicError("input");
  return new Date(candidates[0]).toISOString();
}
export function formatAcademicTime(value: string | Date) {
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: ACADEMIC_TIME_ZONE,
    dateStyle: "medium",
    timeStyle: "short",
    hourCycle: "h23",
  }).format(new Date(value));
}

export function instantToLocal(value: Date | string) {
  return wallTime(new Date(value).getTime()).slice(0, 16);
}
