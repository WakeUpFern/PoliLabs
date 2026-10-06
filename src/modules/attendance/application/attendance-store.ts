import type { PermissionKey } from "@/modules/identity/domain/access-catalog";
import type {
  Attendance,
  AttendanceCandidate,
  AttendanceStatus,
  OperationContext,
  OperationSource,
} from "../domain/attendance";
export type AttendanceTarget = {
  sessionId: string;
  spaceId: string;
  status: string;
  isParticipant: boolean;
};
export interface AttendanceTransaction {
  candidates(
    context: OperationContext,
    locationId: string | null,
  ): Promise<{
    location: { id: string; name: string } | null;
    sessions: AttendanceCandidate[];
  }>;
  target(
    context: OperationContext,
    sessionId: string,
  ): Promise<AttendanceTarget>;
  validateLocation(
    context: OperationContext,
    locationId: string,
    spaceId: string,
  ): Promise<void>;
  validateParticipant(
    context: OperationContext,
    sessionId: string,
    userId: string,
    active: boolean,
  ): Promise<void>;
  find(sessionId: string, userId: string): Promise<Attendance | null>;
  mine(context: OperationContext): Promise<Attendance[]>;
  roster(
    context: OperationContext,
    sessionId: string,
  ): Promise<
    {
      userId: string;
      name: string;
      locationName: string | null;
      attendance: Attendance | null;
    }[]
  >;
  history(
    context: OperationContext,
    sessionId: string,
  ): Promise<
    {
      id: string;
      userId: string;
      actorName: string;
      action: string;
      reason: string | null;
      createdAt: Date;
      snapshot: unknown;
    }[]
  >;
  insert(
    context: OperationContext,
    target: AttendanceTarget,
    userId: string,
    locationId: string | null,
    status: AttendanceStatus,
    source: OperationSource,
    reason: string | null,
  ): Promise<Attendance>;
  correct(
    context: OperationContext,
    before: Attendance,
    status: AttendanceStatus,
    source: OperationSource,
    reason: string,
  ): Promise<Attendance>;
}
export interface AttendanceStore {
  run<T>(
    context: OperationContext,
    permission: PermissionKey,
    operation: (tx: AttendanceTransaction) => Promise<T>,
  ): Promise<T>;
}
