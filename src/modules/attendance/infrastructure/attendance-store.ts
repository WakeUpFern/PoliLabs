import { and, asc, desc, eq } from "drizzle-orm";
import {
  authorizeLocked,
  type OperationDatabase,
  type OperationTransaction,
} from "@/modules/identity/infrastructure/authorize-locked";
import type { PermissionKey } from "@/modules/identity/domain/access-catalog";
import { users } from "@/modules/identity/infrastructure/auth-schema";
import { laboratoryMemberships } from "@/modules/identity/infrastructure/access-schema";
import {
  practices,
  labSessions,
  sessionParticipants,
} from "@/modules/academic/infrastructure/academic-schema";
import {
  spaces,
  locations,
} from "@/modules/spatial/infrastructure/spatial-schema";
import {
  AttendanceError,
  attendanceId,
  type OperationContext,
  type Attendance,
  type AttendanceStatus,
  type OperationSource,
} from "../domain/attendance";
import type {
  AttendanceStore,
  AttendanceTransaction,
  AttendanceTarget,
} from "../application/attendance-store";
import { attendance, attendanceEvents } from "./attendance-schema";
export class DrizzleAttendanceTransaction implements AttendanceTransaction {
  constructor(private readonly tx: OperationTransaction) {}
  async candidates(context: OperationContext, locationId: string | null) {
    let location: { id: string; name: string; spaceId: string } | null = null;
    if (locationId) {
      const [row] = await this.tx
        .select({
          id: locations.id,
          name: locations.name,
          spaceId: locations.spaceId,
        })
        .from(locations)
        .innerJoin(spaces, eq(spaces.id, locations.spaceId))
        .where(
          and(
            eq(locations.id, locationId),
            eq(locations.isActive, true),
            eq(spaces.isActive, true),
            eq(spaces.laboratoryId, context.laboratoryId),
          ),
        );
      if (!row) throw new AttendanceError("not-found");
      location = row;
    }
    const sessions = await this.tx
      .select({
        id: labSessions.id,
        title: practices.title,
        startsAt: labSessions.startsAt,
        endsAt: labSessions.endsAt,
        spaceId: labSessions.spaceId,
      })
      .from(labSessions)
      .innerJoin(practices, eq(practices.id, labSessions.practiceId))
      .innerJoin(spaces, eq(spaces.id, labSessions.spaceId))
      .innerJoin(
        sessionParticipants,
        and(
          eq(sessionParticipants.sessionId, labSessions.id),
          eq(sessionParticipants.userId, context.actorUserId),
        ),
      )
      .where(
        and(
          eq(labSessions.laboratoryId, context.laboratoryId),
          eq(labSessions.status, "open"),
          eq(practices.status, "published"),
          eq(spaces.isActive, true),
          location ? eq(labSessions.spaceId, location.spaceId) : undefined,
        ),
      )
      .orderBy(asc(labSessions.startsAt), asc(labSessions.id));
    return { location, sessions };
  }
  async target(context: OperationContext, sessionId: string) {
    const condition = and(
      eq(labSessions.id, sessionId),
      eq(labSessions.laboratoryId, context.laboratoryId),
    );
    const [ref] = await this.tx
      .select({ practiceId: labSessions.practiceId })
      .from(labSessions)
      .where(condition);
    if (!ref) throw new AttendanceError("not-found");
    await this.tx
      .select({ id: practices.id })
      .from(practices)
      .where(
        and(
          eq(practices.id, ref.practiceId),
          eq(practices.laboratoryId, context.laboratoryId),
        ),
      )
      .for("update");
    const [session] = await this.tx
      .select()
      .from(labSessions)
      .where(condition)
      .for("update");
    if (!session) throw new AttendanceError("not-found");
    const [p] = await this.tx
      .select({ id: sessionParticipants.userId })
      .from(sessionParticipants)
      .where(
        and(
          eq(sessionParticipants.sessionId, sessionId),
          eq(sessionParticipants.userId, context.actorUserId),
        ),
      );
    return {
      sessionId,
      spaceId: session.spaceId,
      status: session.status,
      isParticipant: !!p,
    };
  }
  async validateLocation(
    context: OperationContext,
    locationId: string,
    spaceId: string,
  ) {
    const [space] = await this.tx
      .select({ id: spaces.id })
      .from(spaces)
      .where(
        and(
          eq(spaces.id, spaceId),
          eq(spaces.laboratoryId, context.laboratoryId),
          eq(spaces.isActive, true),
        ),
      )
      .for("share");
    if (!space) throw new AttendanceError("relation");
    const [location] = await this.tx
      .select({ id: locations.id })
      .from(locations)
      .where(
        and(
          eq(locations.id, locationId),
          eq(locations.spaceId, spaceId),
          eq(locations.isActive, true),
        ),
      )
      .for("share");
    if (!location) throw new AttendanceError("relation");
  }
  async validateParticipant(
    context: OperationContext,
    sessionId: string,
    userId: string,
    active: boolean,
  ) {
    const [session] = await this.tx
      .select({ spaceId: labSessions.spaceId })
      .from(labSessions)
      .where(
        and(
          eq(labSessions.id, sessionId),
          eq(labSessions.laboratoryId, context.laboratoryId),
        ),
      );
    if (!session) throw new AttendanceError("relation");
    const [space] = await this.tx
      .select({ id: spaces.id })
      .from(spaces)
      .where(and(eq(spaces.id, session.spaceId), eq(spaces.isActive, true)))
      .for("share");
    if (!space) throw new AttendanceError("relation");
    const [p] = await this.tx
      .select({ id: users.id })
      .from(users)
      .innerJoin(
        laboratoryMemberships,
        eq(laboratoryMemberships.userId, users.id),
      )
      .innerJoin(
        sessionParticipants,
        and(
          eq(sessionParticipants.userId, users.id),
          eq(sessionParticipants.sessionId, sessionId),
        ),
      )
      .where(
        and(
          eq(users.id, userId),
          eq(laboratoryMemberships.laboratoryId, context.laboratoryId),
          active ? eq(users.isActive, true) : undefined,
          active ? eq(laboratoryMemberships.isActive, true) : undefined,
        ),
      )
      .for("share");
    if (!p) throw new AttendanceError("relation");
  }
  async find(sessionId: string, userId: string) {
    const [row] = await this.tx
      .select()
      .from(attendance)
      .where(
        and(eq(attendance.sessionId, sessionId), eq(attendance.userId, userId)),
      );
    return row ?? null;
  }
  mine(context: OperationContext) {
    return this.tx
      .select({ ...attendanceColumns })
      .from(attendance)
      .innerJoin(labSessions, eq(labSessions.id, attendance.sessionId))
      .where(
        and(
          eq(attendance.userId, context.actorUserId),
          eq(labSessions.laboratoryId, context.laboratoryId),
        ),
      )
      .orderBy(desc(attendance.createdAt));
  }
  roster(context: OperationContext, sessionId: string) {
    return this.tx
      .select({
        userId: users.id,
        name: users.name,
        attendance: attendanceColumns,
        locationName: locations.name,
      })
      .from(sessionParticipants)
      .innerJoin(users, eq(users.id, sessionParticipants.userId))
      .leftJoin(
        attendance,
        and(
          eq(attendance.sessionId, sessionParticipants.sessionId),
          eq(attendance.userId, sessionParticipants.userId),
        ),
      )
      .leftJoin(locations, eq(locations.id, attendance.locationId))
      .where(
        and(
          eq(sessionParticipants.sessionId, sessionId),
          eq(sessionParticipants.laboratoryId, context.laboratoryId),
        ),
      )
      .orderBy(asc(users.name), asc(users.id));
  }
  history(context: OperationContext, sessionId: string) {
    return this.tx
      .select({
        id: attendanceEvents.id,
        userId: attendance.userId,
        actorName: users.name,
        action: attendanceEvents.action,
        reason: attendanceEvents.reason,
        createdAt: attendanceEvents.createdAt,
        snapshot: attendanceEvents.snapshot,
      })
      .from(attendanceEvents)
      .innerJoin(attendance, eq(attendance.id, attendanceEvents.attendanceId))
      .innerJoin(users, eq(users.id, attendanceEvents.actorUserId))
      .innerJoin(labSessions, eq(labSessions.id, attendance.sessionId))
      .where(
        and(
          eq(attendance.sessionId, sessionId),
          eq(labSessions.laboratoryId, context.laboratoryId),
        ),
      )
      .orderBy(desc(attendanceEvents.createdAt), desc(attendanceEvents.id));
  }
  async insert(
    context: OperationContext,
    target: AttendanceTarget,
    userId: string,
    locationId: string | null,
    status: AttendanceStatus,
    source: OperationSource,
    reason: string | null,
  ) {
    const [row] = await this.tx
      .insert(attendance)
      .values({
        sessionId: target.sessionId,
        spaceId: target.spaceId,
        userId,
        locationId,
        status,
        recordedBy: context.actorUserId,
        checkInAt: status === "absent" ? null : new Date(),
      })
      .onConflictDoNothing({
        target: [attendance.sessionId, attendance.userId],
      })
      .returning();
    if (!row) {
      const existing = await this.find(target.sessionId, userId);
      if (!existing) throw new AttendanceError("conflict");
      return existing;
    }
    await this.tx.insert(attendanceEvents).values({
      attendanceId: row.id,
      actorUserId: context.actorUserId,
      source,
      action: "attendance.recorded",
      reason,
      snapshot: { before: null, after: row },
    });
    return row;
  }
  async correct(
    context: OperationContext,
    before: Attendance,
    status: AttendanceStatus,
    source: OperationSource,
    reason: string,
  ) {
    const [row] = await this.tx
      .update(attendance)
      .set({ status, version: before.version + 1, updatedAt: new Date() })
      .where(
        and(
          eq(attendance.id, before.id),
          eq(attendance.version, before.version),
        ),
      )
      .returning();
    if (!row) throw new AttendanceError("conflict");
    await this.tx.insert(attendanceEvents).values({
      attendanceId: row.id,
      actorUserId: context.actorUserId,
      source,
      action: "attendance.corrected",
      reason,
      snapshot: { before, after: row },
    });
    return row;
  }
}
// Explicit projection prevents accidental roster/identity disclosure in own history.
const attendanceColumns = {
  id: attendance.id,
  sessionId: attendance.sessionId,
  userId: attendance.userId,
  spaceId: attendance.spaceId,
  checkInAt: attendance.checkInAt,
  locationId: attendance.locationId,
  status: attendance.status,
  recordedBy: attendance.recordedBy,
  version: attendance.version,
  createdAt: attendance.createdAt,
  updatedAt: attendance.updatedAt,
};
export class DrizzleAttendanceStore implements AttendanceStore {
  constructor(private readonly db: OperationDatabase) {}
  run<T>(
    context: OperationContext,
    permission: PermissionKey,
    operation: (tx: AttendanceTransaction) => Promise<T>,
  ): Promise<T> {
    attendanceId(context.actorUserId);
    attendanceId(context.laboratoryId);
    return this.db.transaction(
      async (tx) => {
        await authorizeLocked(tx, context, permission);
        return operation(new DrizzleAttendanceTransaction(tx));
      },
      { isolationLevel: "read committed" },
    );
  }
}
