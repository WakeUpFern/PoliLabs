export const PRACTICE_STATUSES = ["draft", "published", "closed"] as const;
export const SESSION_STATUSES = [
  "scheduled",
  "open",
  "closed",
  "cancelled",
] as const;
export const ACADEMIC_SOURCES = ["WEB", "API", "AGENT", "SYSTEM"] as const;
export type PracticeStatus = (typeof PRACTICE_STATUSES)[number];
export type SessionStatus = (typeof SESSION_STATUSES)[number];
export type AcademicSource = (typeof ACADEMIC_SOURCES)[number];
export class AcademicError extends Error {
  constructor(
    public readonly code:
      "input" | "not-found" | "state" | "relation" | "own-participation",
  ) {
    super(`Academic operation rejected: ${code}`);
    this.name = "AcademicError";
  }
}
export function academicId(value: string) {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
    throw new AcademicError("input");
  return value.toLowerCase();
}
export function academicSource(value: string): AcademicSource {
  if (!ACADEMIC_SOURCES.includes(value as AcademicSource))
    throw new AcademicError("input");
  return value as AcademicSource;
}
export function practiceValues(input: { title: string; instructions: string }) {
  const title = input.title.trim();
  const instructions = input.instructions.trim();
  if (
    !title ||
    title.length > 200 ||
    !instructions ||
    instructions.length > 20000
  )
    throw new AcademicError("input");
  return { title, instructions };
}
function instant(value: string) {
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(
      value,
    )
  )
    throw new AcademicError("input");
  const date = new Date(value);
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  if (
    !Number.isFinite(date.getTime()) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > new Date(Date.UTC(year, month, 0)).getUTCDate() ||
    Number(value.slice(11, 13)) > 23
  )
    throw new AcademicError("input");
  return date;
}
export function sessionValues(input: {
  spaceId: string;
  teacherUserId: string;
  startsAt: string;
  endsAt: string;
}) {
  const startsAt = instant(input.startsAt);
  const endsAt = instant(input.endsAt);
  if (startsAt >= endsAt) throw new AcademicError("input");
  return {
    spaceId: academicId(input.spaceId),
    teacherUserId: academicId(input.teacherUserId),
    startsAt,
    endsAt,
  };
}
export function practiceTransition(
  from: PracticeStatus,
  to: string,
): PracticeStatus {
  if (
    (from === "draft" && to === "published") ||
    (from === "published" && to === "closed")
  )
    return to;
  throw new AcademicError("state");
}
export function sessionTransition(
  from: SessionStatus,
  to: string,
): SessionStatus {
  if (
    (from === "scheduled" && (to === "open" || to === "cancelled")) ||
    (from === "open" && (to === "closed" || to === "cancelled"))
  )
    return to;
  throw new AcademicError("state");
}
export function requireSessionEditable(status: SessionStatus) {
  if (status !== "scheduled") throw new AcademicError("state");
}
export function participantIds(values: readonly string[]) {
  if (!Array.isArray(values) || values.length > 500)
    throw new AcademicError("input");
  const ids = values.map(academicId).sort();
  if (new Set(ids).size !== ids.length) throw new AcademicError("input");
  return ids;
}
export type Practice = {
  id: string;
  laboratoryId: string;
  title: string;
  instructions: string;
  status: PracticeStatus;
  createdBy: string;
};
export type LabSession = {
  id: string;
  laboratoryId: string;
  practiceId: string;
  spaceId: string;
  teacherUserId: string;
  startsAt: Date;
  endsAt: Date;
  status: SessionStatus;
};
export type MemberOption = { id: string; name: string; canTeach: boolean };
