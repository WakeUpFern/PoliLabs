import { and, eq, desc, asc, lte, ne, sql, getTableColumns } from "drizzle-orm";
import {
  authorizeLocked,
  type OperationDatabase,
  type OperationTransaction,
} from "@/modules/identity/infrastructure/authorize-locked";
import { users } from "@/modules/identity/infrastructure/auth-schema";
import {
  spaces,
  resources,
  locations,
} from "@/modules/spatial/infrastructure/spatial-schema";
import {
  practices,
  labSessions,
  sessionParticipants,
} from "@/modules/academic/infrastructure/academic-schema";
import { resourceUsage } from "@/modules/usage/infrastructure/usage-schema";
import { incidentReports, incidentEvents } from "./incident-schema";
import {
  IncidentError,
  incidentId,
  requireIncidentTransition,
  type IncidentContext,
  type IncidentScope,
  type IncidentReport,
  type IncidentSource,
  type IncidentTargetSnapshot,
  type IncidentOptions,
} from "../domain/incidents";
import type {
  IncidentStore,
  IncidentTransaction,
} from "../application/incident-store";
import type { PermissionKey } from "@/modules/identity/domain/access-catalog";
const usageColumns = {
  id: resourceUsage.id,
  resourceId: resourceUsage.resourceId,
  userName: users.name,
  startedAt: resourceUsage.startedAt,
  endedAt: resourceUsage.endedAt,
  sessionId: resourceUsage.sessionId,
  reservationId: resourceUsage.reservationId,
};
class DrizzleIncidentTransaction implements IncidentTransaction {
  constructor(
    private readonly tx: OperationTransaction,
    private readonly context: IncidentContext,
    private readonly keys: readonly string[],
  ) {}
  async options(): Promise<IncidentOptions> {
    const spaceRows = await this.tx
      .select()
      .from(spaces)
      .where(
        and(
          eq(spaces.laboratoryId, this.context.laboratoryId),
          eq(spaces.isActive, true),
        ),
      )
      .orderBy(asc(spaces.name));
    const resourceRows = await this.tx
      .select({
        id: resources.id,
        name: resources.name,
        spaceName: spaces.name,
      })
      .from(resources)
      .innerJoin(spaces, eq(spaces.id, resources.spaceId))
      .where(
        and(
          eq(spaces.laboratoryId, this.context.laboratoryId),
          eq(spaces.isActive, true),
          eq(resources.isActive, true),
        ),
      )
      .orderBy(asc(spaces.name), asc(resources.name));
    const sessionRows = await this.tx
      .select({
        id: labSessions.id,
        title: practices.title,
        startsAt: labSessions.startsAt,
        spaceName: spaces.name,
      })
      .from(labSessions)
      .innerJoin(practices, eq(practices.id, labSessions.practiceId))
      .innerJoin(spaces, eq(spaces.id, labSessions.spaceId))
      .where(
        and(
          eq(labSessions.laboratoryId, this.context.laboratoryId),
          eq(spaces.isActive, true),
          this.keys.includes("academic.manage")
            ? undefined
            : sql`${practices.status} <> 'draft' and exists (select 1 from session_participants sp where sp.session_id = ${labSessions.id} and sp.user_id = ${this.context.actorUserId})`,
        ),
      )
      .orderBy(desc(labSessions.startsAt));
    const usages = await this.tx
      .select({ ...usageColumns, resourceName: resources.name })
      .from(resourceUsage)
      .innerJoin(users, eq(users.id, resourceUsage.userId))
      .innerJoin(resources, eq(resources.id, resourceUsage.resourceId))
      .innerJoin(spaces, eq(spaces.id, resourceUsage.spaceId))
      .where(
        and(
          eq(spaces.laboratoryId, this.context.laboratoryId),
          eq(resourceUsage.userId, this.context.actorUserId),
          sql`${resourceUsage.endedAt} is null`,
          eq(spaces.isActive, true),
          eq(resources.isActive, true),
        ),
      )
      .orderBy(desc(resourceUsage.startedAt));
    return {
      targets: [
        ...resourceRows.map((r) => ({
          kind: "resource" as const,
          id: r.id,
          name: `${r.name} · ${r.spaceName}`,
        })),
        ...spaceRows.map((s) => ({
          kind: "space" as const,
          id: s.id,
          name: s.name,
        })),
        ...sessionRows.map((s) => ({
          kind: "session" as const,
          id: s.id,
          name: `${s.title} · ${s.spaceName} · ${s.startsAt.toISOString()}`,
        })),
      ],
      usages,
    };
  }
  async report(input: IncidentReport) {
    // Follow the existing Academic lock order; a report does not change its lifecycle.
    let spaceId = input.targetId,
      sessionId: string | null = null,
      resourceId: string | null = null;
    let name = "";
    if (input.targetKind === "session") {
      const [ref] = await this.tx
        .select({ practiceId: labSessions.practiceId })
        .from(labSessions)
        .where(
          and(
            eq(labSessions.id, input.targetId),
            eq(labSessions.laboratoryId, this.context.laboratoryId),
          ),
        );
      if (!ref) throw new IncidentError("not-found");
      const [practice] = await this.tx
        .select()
        .from(practices)
        .where(eq(practices.id, ref.practiceId))
        .for("share");
      const [session] = await this.tx
        .select()
        .from(labSessions)
        .where(
          and(
            eq(labSessions.id, input.targetId),
            eq(labSessions.laboratoryId, this.context.laboratoryId),
          ),
        )
        .for("share");
      if (!practice || !session) throw new IncidentError("not-found");
      if (this.keys.includes("academic.manage")) {
        await authorizeLocked(this.tx, this.context, "academic.manage");
      } else {
        const [participant] = await this.tx
          .select()
          .from(sessionParticipants)
          .where(
            and(
              eq(sessionParticipants.sessionId, session.id),
              eq(sessionParticipants.userId, this.context.actorUserId),
            ),
          )
          .for("share");
        if (!participant || practice.status === "draft")
          throw new IncidentError("not-found");
      }
      sessionId = session.id;
      spaceId = session.spaceId;
      name = `${practice.title} · ${session.startsAt.toISOString()}`;
    } else if (input.targetKind === "resource") {
      const [ref] = await this.tx
        .select({ spaceId: resources.spaceId })
        .from(resources)
        .innerJoin(spaces, eq(spaces.id, resources.spaceId))
        .where(
          and(
            eq(resources.id, input.targetId),
            eq(spaces.laboratoryId, this.context.laboratoryId),
          ),
        );
      if (!ref) throw new IncidentError("not-found");
      spaceId = ref.spaceId;
      resourceId = input.targetId;
    }
    const [space] = await this.tx
      .select()
      .from(spaces)
      .where(
        and(
          eq(spaces.id, spaceId),
          eq(spaces.laboratoryId, this.context.laboratoryId),
        ),
      )
      .for("share");
    if (!space || !space.isActive) throw new IncidentError("not-found");
    let locationId: string | null = null,
      locationName: string | null = null;
    if (resourceId) {
      const [resource] = await this.tx
        .select()
        .from(resources)
        .where(
          and(eq(resources.id, resourceId), eq(resources.spaceId, space.id)),
        )
        .for("share");
      if (!resource || !resource.isActive) throw new IncidentError("not-found");
      name = resource.name;
      if (resource.locationId) {
        const [location] = await this.tx
          .select()
          .from(locations)
          .where(
            and(
              eq(locations.id, resource.locationId),
              eq(locations.spaceId, space.id),
            ),
          )
          .for("share");
        if (location) {
          locationId = location.id;
          locationName = location.name;
        }
      }
    }
    if (input.usageId) {
      const [usage] = await this.tx
        .select()
        .from(resourceUsage)
        .where(
          and(
            eq(resourceUsage.id, input.usageId),
            eq(resourceUsage.resourceId, resourceId!),
            eq(resourceUsage.spaceId, space.id),
            eq(resourceUsage.userId, this.context.actorUserId),
          ),
        )
        .for("share");
      if (!usage || usage.endedAt) throw new IncidentError("relation");
    }
    const snapshot: IncidentTargetSnapshot = {
      name: name || space.name,
      spaceName: space.name,
      locationId,
      locationName,
    };
    const [row] = await this.tx
      .insert(incidentReports)
      .values({
        laboratoryId: this.context.laboratoryId,
        targetKind: input.targetKind,
        spaceId: space.id,
        resourceId,
        sessionId,
        usageId: input.usageId,
        reportedBy: this.context.actorUserId,
        description: input.description,
        severity: input.severity,
        targetSnapshot: snapshot,
        createdAt: sql`clock_timestamp()`,
        updatedAt: sql`clock_timestamp()`,
      })
      .returning();
    await this.tx.insert(incidentEvents).values({
      incidentId: row.id,
      actorUserId: this.context.actorUserId,
      source: input.source,
      action: "incident.reported",
      note: input.description,
      snapshot: { after: row },
      createdAt: sql`clock_timestamp()`,
    });
    return this.get(row.id, "laboratory");
  }
  private async get(id: string, scope: IncidentScope) {
    const [row] = await this.tx
      .select({ ...getTableColumns(incidentReports), reporterName: users.name })
      .from(incidentReports)
      .innerJoin(users, eq(users.id, incidentReports.reportedBy))
      .where(
        and(
          eq(incidentReports.id, id),
          eq(incidentReports.laboratoryId, this.context.laboratoryId),
          scope === "own"
            ? eq(incidentReports.reportedBy, this.context.actorUserId)
            : undefined,
        ),
      );
    if (!row) throw new IncidentError("not-found");
    return row;
  }
  list(scope: IncidentScope) {
    return this.tx
      .select({ ...getTableColumns(incidentReports), reporterName: users.name })
      .from(incidentReports)
      .innerJoin(users, eq(users.id, incidentReports.reportedBy))
      .where(
        and(
          eq(incidentReports.laboratoryId, this.context.laboratoryId),
          scope === "own"
            ? eq(incidentReports.reportedBy, this.context.actorUserId)
            : undefined,
        ),
      )
      .orderBy(desc(incidentReports.createdAt), desc(incidentReports.id));
  }
  async detail(id: string, scope: IncidentScope) {
    const incident = await this.get(id, scope);
    const events = await this.tx
      .select({
        id: incidentEvents.id,
        actorUserId: incidentEvents.actorUserId,
        actorName: users.name,
        source: incidentEvents.source,
        action: incidentEvents.action,
        note: incidentEvents.note,
        createdAt: incidentEvents.createdAt,
      })
      .from(incidentEvents)
      .innerJoin(users, eq(users.id, incidentEvents.actorUserId))
      .where(eq(incidentEvents.incidentId, id))
      .orderBy(asc(incidentEvents.createdAt), asc(incidentEvents.id));
    const relatedUsage = incident.usageId
      ? ((
          await this.tx
            .select(usageColumns)
            .from(resourceUsage)
            .innerJoin(users, eq(users.id, resourceUsage.userId))
            .where(eq(resourceUsage.id, incident.usageId))
        )[0] ?? null)
      : null;
    return { incident, events, relatedUsage };
  }
  async transition(
    id: string,
    input: {
      next: string;
      expectedVersion: number;
      note: string;
      source: IncidentSource;
    },
  ) {
    const [before] = await this.tx
      .select()
      .from(incidentReports)
      .where(
        and(
          eq(incidentReports.id, id),
          eq(incidentReports.laboratoryId, this.context.laboratoryId),
        ),
      )
      .for("update");
    if (!before) throw new IncidentError("not-found");
    if (before.version !== input.expectedVersion)
      throw new IncidentError("conflict");
    const status = requireIncidentTransition(before.status, input.next);
    const [row] = await this.tx
      .update(incidentReports)
      .set({
        status,
        version: before.version + 1,
        updatedAt: sql`clock_timestamp()`,
        resolution: status === "resolved" ? input.note : null,
        resolvedAt: status === "resolved" ? sql`clock_timestamp()` : null,
      })
      .where(eq(incidentReports.id, id))
      .returning();
    await this.tx.insert(incidentEvents).values({
      incidentId: id,
      actorUserId: this.context.actorUserId,
      source: input.source,
      action: `incident.${status}`,
      note: input.note,
      snapshot: { before, after: row },
      createdAt: sql`clock_timestamp()`,
    });
    return this.get(id, "laboratory");
  }
  async trace(id: string) {
    await authorizeLocked(this.tx, this.context, "usage.trace");
    const incident = await this.get(id, "laboratory");
    if (!incident.resourceId) return [];
    return this.tx
      .select(usageColumns)
      .from(resourceUsage)
      .innerJoin(users, eq(users.id, resourceUsage.userId))
      .where(
        and(
          eq(resourceUsage.resourceId, incident.resourceId),
          eq(resourceUsage.spaceId, incident.spaceId),
          lte(resourceUsage.startedAt, incident.createdAt),
          incident.usageId ? ne(resourceUsage.id, incident.usageId) : undefined,
        ),
      )
      .orderBy(desc(resourceUsage.startedAt), desc(resourceUsage.id))
      .limit(51);
  }
}
export class DrizzleIncidentStore implements IncidentStore {
  constructor(private readonly db: OperationDatabase) {}
  run<T>(
    context: IncidentContext,
    permission: PermissionKey,
    operation: (
      tx: IncidentTransaction,
      permissionKeys: readonly string[],
    ) => Promise<T>,
  ): Promise<T> {
    incidentId(context.actorUserId);
    incidentId(context.laboratoryId);
    return this.db.transaction(
      async (tx) => {
        const grant = await authorizeLocked(tx, context, permission);
        return operation(
          new DrizzleIncidentTransaction(tx, context, grant.permissionKeys),
          grant.permissionKeys,
        );
      },
      { isolationLevel: "read committed" },
    );
  }
}
