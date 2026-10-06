import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import {
  authorizeLocked,
  type OperationDatabase,
  type OperationTransaction,
} from "@/modules/identity/infrastructure/authorize-locked";
import type { PermissionKey } from "@/modules/identity/domain/access-catalog";
import { users } from "@/modules/identity/infrastructure/auth-schema";
import {
  practices,
  labSessions,
  sessionParticipants,
} from "@/modules/academic/infrastructure/academic-schema";
import {
  reservations,
  reservationResources,
} from "@/modules/reservations/infrastructure/reservation-schema";
import {
  spaces,
  resources,
} from "@/modules/spatial/infrastructure/spatial-schema";
import {
  UsageError,
  usageId,
  requireUsageEligibility,
  type UsageContext,
  type UsageContextKind,
  type UsageSource,
  type UsageOption,
} from "../domain/usage";
import type { UsageStore, UsageTransaction } from "../application/usage-store";
import { resourceUsage, usageEvents } from "./usage-schema";
class DrizzleUsageTransaction implements UsageTransaction {
  constructor(private readonly tx: OperationTransaction) {}
  async options(context: UsageContext): Promise<UsageOption[]> {
    const academic = await this.tx
      .select({
        contextId: labSessions.id,
        startsAt: labSessions.startsAt,
        endsAt: labSessions.endsAt,
        title: practices.title,
        resourceId: resources.id,
        resourceName: resources.name,
      })
      .from(labSessions)
      .innerJoin(practices, eq(practices.id, labSessions.practiceId))
      .innerJoin(
        sessionParticipants,
        and(
          eq(sessionParticipants.sessionId, labSessions.id),
          eq(sessionParticipants.userId, context.actorUserId),
        ),
      )
      .innerJoin(spaces, eq(spaces.id, labSessions.spaceId))
      .innerJoin(resources, eq(resources.spaceId, spaces.id))
      .where(
        and(
          eq(labSessions.laboratoryId, context.laboratoryId),
          eq(labSessions.status, "open"),
          eq(practices.status, "published"),
          eq(spaces.isActive, true),
          eq(resources.isActive, true),
        ),
      )
      .orderBy(asc(labSessions.startsAt), asc(resources.name));
    const reservation = await this.tx
      .select({
        contextId: reservations.id,
        startsAt: reservations.startsAt,
        endsAt: reservations.endsAt,
        title: spaces.name,
        resourceId: resources.id,
        resourceName: resources.name,
      })
      .from(reservations)
      .innerJoin(spaces, eq(spaces.id, reservations.spaceId))
      .innerJoin(resources, eq(resources.spaceId, spaces.id))
      .where(
        and(
          eq(spaces.laboratoryId, context.laboratoryId),
          eq(spaces.isActive, true),
          eq(resources.isActive, true),
          eq(reservations.createdBy, context.actorUserId),
          eq(reservations.status, "confirmed"),
          sql`${reservations.startsAt} <= clock_timestamp() and clock_timestamp() < ${reservations.endsAt}`,
          sql`(${reservations.isExclusive} or exists (select 1 from reservation_resources rr where rr.reservation_id = ${reservations.id} and rr.resource_id = ${resources.id}))`,
        ),
      )
      .orderBy(asc(reservations.startsAt), asc(resources.name));
    return [
      ...academic.map((r) => ({ ...r, kind: "academic" as const })),
      ...reservation.map((r) => ({ ...r, kind: "reservation" as const })),
    ];
  }
  async validate(
    context: UsageContext,
    kind: UsageContextKind,
    contextId: string,
    resourceId: string,
  ) {
    let spaceId: string;
    if (kind === "academic") {
      const [ref] = await this.tx
        .select({ practiceId: labSessions.practiceId })
        .from(labSessions)
        .where(
          and(
            eq(labSessions.id, contextId),
            eq(labSessions.laboratoryId, context.laboratoryId),
          ),
        );
      if (!ref) throw new UsageError("not-found");
      await this.tx
        .select({ id: practices.id })
        .from(practices)
        .where(eq(practices.id, ref.practiceId))
        .for("update");
      const [session] = await this.tx
        .select()
        .from(labSessions)
        .where(
          and(
            eq(labSessions.id, contextId),
            eq(labSessions.laboratoryId, context.laboratoryId),
          ),
        )
        .for("update");
      if (!session) throw new UsageError("not-found");
      const [participant] = await this.tx
        .select({ id: sessionParticipants.userId })
        .from(sessionParticipants)
        .where(
          and(
            eq(sessionParticipants.sessionId, contextId),
            eq(sessionParticipants.userId, context.actorUserId),
          ),
        );
      requireUsageEligibility(
        {
          kind,
          status: session.status,
          isEligibleUser: !!participant,
          startsAt: session.startsAt,
          endsAt: session.endsAt,
        },
        new Date(),
      );
      spaceId = session.spaceId;
      // Match Academic lock order: Practice -> LabSession -> Space -> Resource.
      const [space] = await this.tx
        .select()
        .from(spaces)
        .where(
          and(
            eq(spaces.id, spaceId),
            eq(spaces.laboratoryId, context.laboratoryId),
            eq(spaces.isActive, true),
          ),
        )
        .for("share");
      if (!space) throw new UsageError("relation");
    } else {
      const [ref] = await this.tx
        .select({ spaceId: reservations.spaceId })
        .from(reservations)
        .innerJoin(spaces, eq(spaces.id, reservations.spaceId))
        .where(
          and(
            eq(reservations.id, contextId),
            eq(reservations.createdBy, context.actorUserId),
            eq(spaces.laboratoryId, context.laboratoryId),
          ),
        );
      if (!ref) throw new UsageError("not-found");
      spaceId = ref.spaceId;
      // Reservation writes already lock Space before Reservation.
      const [space] = await this.tx
        .select()
        .from(spaces)
        .where(and(eq(spaces.id, spaceId), eq(spaces.isActive, true)))
        .for("share");
      if (!space) throw new UsageError("relation");
      const [reservation] = await this.tx
        .select()
        .from(reservations)
        .where(
          and(
            eq(reservations.id, contextId),
            eq(reservations.createdBy, context.actorUserId),
          ),
        )
        .for("share");
      if (!reservation) throw new UsageError("not-found");
      const now = new Date();
      requireUsageEligibility(
        {
          kind,
          status: reservation.status,
          isEligibleUser: true,
          startsAt: reservation.startsAt,
          endsAt: reservation.endsAt,
        },
        now,
      );
      if (!reservation.isExclusive) {
        const [included] = await this.tx
          .select()
          .from(reservationResources)
          .where(
            and(
              eq(reservationResources.reservationId, contextId),
              eq(reservationResources.resourceId, resourceId),
            ),
          )
          .for("share");
        if (!included) throw new UsageError("relation");
      }
    }
    const [resource] = await this.tx
      .select()
      .from(resources)
      .where(
        and(
          eq(resources.id, resourceId),
          eq(resources.spaceId, spaceId),
          eq(resources.isActive, true),
        ),
      )
      .for("share");
    if (!resource) throw new UsageError("relation");
    // Recheck reservation time after waiting for all locks.
    const now = new Date();
    if (kind === "reservation") {
      const [r] = await this.tx
        .select()
        .from(reservations)
        .where(eq(reservations.id, contextId));
      requireUsageEligibility(
        {
          kind,
          status: r.status,
          isEligibleUser: r.createdBy === context.actorUserId,
          startsAt: r.startsAt,
          endsAt: r.endsAt,
        },
        now,
      );
    }
    return { spaceId, now };
  }
  async start(
    context: UsageContext,
    kind: UsageContextKind,
    contextId: string,
    resourceId: string,
    target: { spaceId: string; now: Date },
    source: UsageSource,
  ) {
    const [row] = await this.tx
      .insert(resourceUsage)
      .values({
        userId: context.actorUserId,
        resourceId,
        spaceId: target.spaceId,
        sessionId: kind === "academic" ? contextId : null,
        reservationId: kind === "reservation" ? contextId : null,
        startedAt: target.now,
      })
      .onConflictDoNothing({
        target: [resourceUsage.userId, resourceUsage.resourceId],
        where: sql`${resourceUsage.endedAt} is null`,
      })
      .returning();
    if (!row) {
      const [existing] = await this.tx
        .select()
        .from(resourceUsage)
        .where(
          and(
            eq(resourceUsage.userId, context.actorUserId),
            eq(resourceUsage.resourceId, resourceId),
            isNull(resourceUsage.endedAt),
          ),
        );
      if (
        !existing ||
        (kind === "academic"
          ? existing.sessionId !== contextId
          : existing.reservationId !== contextId)
      )
        throw new UsageError("conflict");
      return existing;
    }
    await this.tx.insert(usageEvents).values({
      usageId: row.id,
      actorUserId: context.actorUserId,
      source,
      action: "usage.started",
      snapshot: { before: null, after: row },
    });
    return row;
  }
  async finish(context: UsageContext, id: string, source: UsageSource) {
    const [before] = await this.tx
      .select({ ...usageColumns })
      .from(resourceUsage)
      .innerJoin(spaces, eq(spaces.id, resourceUsage.spaceId))
      .where(
        and(
          eq(resourceUsage.id, id),
          eq(resourceUsage.userId, context.actorUserId),
          eq(spaces.laboratoryId, context.laboratoryId),
        ),
      )
      .for("update", { of: resourceUsage });
    if (!before) throw new UsageError("not-found");
    if (before.endedAt) return before;
    const [row] = await this.tx
      .update(resourceUsage)
      .set({
        endedAt: new Date(Math.max(Date.now(), before.startedAt.getTime())),
      })
      .where(eq(resourceUsage.id, id))
      .returning();
    await this.tx.insert(usageEvents).values({
      usageId: row.id,
      actorUserId: context.actorUserId,
      source,
      action: "usage.finished",
      snapshot: { before, after: row },
    });
    return row;
  }
  mine(context: UsageContext) {
    return this.tx
      .select({
        ...usageColumns,
        userName: users.name,
        resourceName: resources.name,
      })
      .from(resourceUsage)
      .innerJoin(users, eq(users.id, resourceUsage.userId))
      .innerJoin(resources, eq(resources.id, resourceUsage.resourceId))
      .innerJoin(spaces, eq(spaces.id, resourceUsage.spaceId))
      .where(
        and(
          eq(resourceUsage.userId, context.actorUserId),
          eq(spaces.laboratoryId, context.laboratoryId),
        ),
      )
      .orderBy(desc(resourceUsage.startedAt), desc(resourceUsage.id));
  }
  async trace(context: UsageContext, resourceId: string) {
    const [resource] = await this.tx
      .select({ id: resources.id })
      .from(resources)
      .innerJoin(spaces, eq(spaces.id, resources.spaceId))
      .where(
        and(
          eq(resources.id, resourceId),
          eq(spaces.laboratoryId, context.laboratoryId),
        ),
      );
    if (!resource) throw new UsageError("not-found");
    return this.tx
      .select({
        ...usageColumns,
        userName: users.name,
        resourceName: resources.name,
      })
      .from(resourceUsage)
      .innerJoin(users, eq(users.id, resourceUsage.userId))
      .innerJoin(resources, eq(resources.id, resourceUsage.resourceId))
      .where(eq(resourceUsage.resourceId, resourceId))
      .orderBy(desc(resourceUsage.startedAt), desc(resourceUsage.id));
  }
}
const usageColumns = {
  id: resourceUsage.id,
  userId: resourceUsage.userId,
  resourceId: resourceUsage.resourceId,
  spaceId: resourceUsage.spaceId,
  sessionId: resourceUsage.sessionId,
  reservationId: resourceUsage.reservationId,
  startedAt: resourceUsage.startedAt,
  endedAt: resourceUsage.endedAt,
  createdAt: resourceUsage.createdAt,
};
export class DrizzleUsageStore implements UsageStore {
  constructor(private readonly db: OperationDatabase) {}
  run<T>(
    context: UsageContext,
    permission: PermissionKey,
    operation: (tx: UsageTransaction) => Promise<T>,
  ): Promise<T> {
    usageId(context.actorUserId);
    usageId(context.laboratoryId);
    return this.db.transaction(
      async (tx) => {
        await authorizeLocked(tx, context, permission);
        return operation(new DrizzleUsageTransaction(tx));
      },
      { isolationLevel: "read committed" },
    );
  }
}
