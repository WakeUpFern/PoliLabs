export const ATTENDANCE_STATUSES = ["present", "late", "absent"] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];
export type OperationContext = { actorUserId: string; laboratoryId: string };
export type OperationSource = "WEB" | "API" | "AGENT" | "SYSTEM";
export class AttendanceError extends Error {
  constructor(
    public readonly code:
      | "input"
      | "not-found"
      | "state"
      | "relation"
      | "own-participation"
      | "conflict",
  ) {
    super(`Attendance rejected: ${code}`);
    this.name = "AttendanceError";
  }
}
export function attendanceId(value: string) {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
    throw new AttendanceError("input");
  return value.toLowerCase();
}
export function attendanceSource(value: string): OperationSource {
  if (!["WEB", "API", "AGENT", "SYSTEM"].includes(value))
    throw new AttendanceError("input");
  return value as OperationSource;
}
export function attendanceStatus(value: string): AttendanceStatus {
  if (!ATTENDANCE_STATUSES.includes(value as AttendanceStatus))
    throw new AttendanceError("input");
  return value as AttendanceStatus;
}
export function correctionReason(value: string) {
  const reason = value.trim();
  if (!reason || reason.length > 2000) throw new AttendanceError("input");
  return reason;
}
export function requireAttendanceState(status: string, correction = false) {
  if (status !== "open" && !(correction && status === "closed"))
    throw new AttendanceError("state");
}
export function protectAttendanceManagement(isParticipant: boolean) {
  if (isParticipant) throw new AttendanceError("own-participation");
}
export type Attendance = {
  id: string;
  sessionId: string;
  userId: string;
  spaceId: string;
  checkInAt: Date | null;
  locationId: string | null;
  status: AttendanceStatus;
  recordedBy: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
};
export type AttendanceCandidate = {
  id: string;
  title: string;
  startsAt: Date;
  endsAt: Date;
  spaceId: string;
};
export function preselectedSession(candidates: readonly AttendanceCandidate[]) {
  return candidates.length === 1 ? candidates[0].id : null;
}
