import {
  attendanceId,
  attendanceSource,
  attendanceStatus,
  correctionReason,
  requireAttendanceState,
  protectAttendanceManagement,
  preselectedSession,
  AttendanceError,
  type OperationContext,
} from "../domain/attendance";
import type { AttendanceStore } from "./attendance-store";
type Write = OperationContext & { source: string };
export class AttendanceService {
  constructor(private readonly store: AttendanceStore) {}
  resolve(input: OperationContext & { locationId?: string | null }) {
    const locationId = input.locationId ? attendanceId(input.locationId) : null;
    return this.store.run(input, "attendance.checkin", async (tx) => {
      const result = await tx.candidates(input, locationId);
      return {
        ...result,
        selectedSessionId: preselectedSession(result.sessions),
      };
    });
  }
  mine(input: OperationContext) {
    return this.store.run(input, "attendance.read", (tx) => tx.mine(input));
  }
  checkIn(input: Write & { sessionId: string; locationId?: string | null }) {
    const sessionId = attendanceId(input.sessionId),
      locationId = input.locationId ? attendanceId(input.locationId) : null,
      source = attendanceSource(input.source);
    return this.store.run(input, "attendance.checkin", async (tx) => {
      const target = await tx.target(input, sessionId);
      if (!target.isParticipant) throw new AttendanceError("not-found");
      // Existing constancy is returned even after closure; never recreate or overwrite it.
      const existing = await tx.find(sessionId, input.actorUserId);
      if (locationId)
        await tx.validateLocation(input, locationId, target.spaceId);
      if (existing) return existing;
      requireAttendanceState(target.status);
      await tx.validateParticipant(input, sessionId, input.actorUserId, true);
      return tx.insert(
        input,
        target,
        input.actorUserId,
        locationId,
        "present",
        source,
        null,
      );
    });
  }
  history(input: OperationContext & { sessionId: string }) {
    const id = attendanceId(input.sessionId);
    return this.store.run(input, "attendance.manage", async (tx) => {
      await tx.target(input, id);
      return tx.history(input, id);
    });
  }
  managementPolicy(input: OperationContext & { sessionId: string }) {
    const id = attendanceId(input.sessionId);
    return this.store.run(input, "attendance.manage", async (tx) => {
      const target = await tx.target(input, id);
      return {
        canRecord: !target.isParticipant && target.status === "open",
        canCorrect:
          !target.isParticipant && ["open", "closed"].includes(target.status),
      };
    });
  }
  roster(input: OperationContext & { sessionId: string }) {
    const id = attendanceId(input.sessionId);
    return this.store.run(input, "attendance.manage", async (tx) => {
      await tx.target(input, id);
      return tx.roster(input, id);
    });
  }
  record(
    input: Write & {
      sessionId: string;
      userId: string;
      status: string;
      reason: string;
    },
  ) {
    const id = attendanceId(input.sessionId),
      userId = attendanceId(input.userId),
      status = attendanceStatus(input.status),
      source = attendanceSource(input.source),
      reason = correctionReason(input.reason);
    return this.store.run(input, "attendance.manage", async (tx) => {
      const target = await tx.target(input, id);
      protectAttendanceManagement(target.isParticipant);
      requireAttendanceState(target.status);
      await tx.validateParticipant(input, id, userId, true);
      if (await tx.find(id, userId)) throw new AttendanceError("conflict");
      return tx.insert(input, target, userId, null, status, source, reason);
    });
  }
  correct(
    input: Write & {
      sessionId: string;
      userId: string;
      status: string;
      reason: string;
      expectedVersion: number;
    },
  ) {
    const id = attendanceId(input.sessionId),
      userId = attendanceId(input.userId),
      status = attendanceStatus(input.status),
      source = attendanceSource(input.source),
      reason = correctionReason(input.reason);
    if (
      !Number.isSafeInteger(input.expectedVersion) ||
      input.expectedVersion < 1
    )
      throw new AttendanceError("input");
    return this.store.run(input, "attendance.manage", async (tx) => {
      const target = await tx.target(input, id);
      protectAttendanceManagement(target.isParticipant);
      requireAttendanceState(target.status, true);
      const before = await tx.find(id, userId);
      if (!before) throw new AttendanceError("not-found");
      if (before.version !== input.expectedVersion)
        throw new AttendanceError("conflict");
      return tx.correct(input, before, status, source, reason);
    });
  }
}
