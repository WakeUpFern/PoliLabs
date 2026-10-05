import { AuthorizationDeniedError } from "@/modules/identity/domain/access-errors";
import { isSpatialId } from "@/modules/spatial/domain/spatial-id";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "@/infrastructure/database/schema";
import { AuthorizationService } from "@/modules/identity/application/authorization-service";
import { DrizzleAuthorizationReader } from "@/modules/identity/infrastructure/access-repository";
import {
  laboratories,
  laboratoryMemberships,
  membershipRoles,
  permissions,
  rolePermissions,
  roles,
} from "@/modules/identity/infrastructure/access-schema";
import { users } from "@/modules/identity/infrastructure/auth-schema";
import type { PermissionKey } from "@/modules/identity/domain/access-catalog";
import {
  spaces,
  resources,
} from "@/modules/spatial/infrastructure/spatial-schema";
import {
  conflicts,
  requireCancellable,
  requireFutureStart,
  ReservationConflictError,
  ReservationInputError,
  ReservationNotFoundError,
  ReservationTargetError,
  type Reservation,
} from "../domain/reservation";
import type {
  ActorContext,
  ReservationRequest,
  ReservationSession,
  ReservationStore,
} from "../application/reservation-store";
import { reservations, reservationResources } from "./reservation-schema";

type Database = NodePgDatabase<typeof schema>;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

function postgresCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return;
  if ("code" in error && typeof error.code === "string") return error.code;
  if ("cause" in error) return postgresCode(error.cause);
}

class DrizzleReservationSession implements ReservationSession {
  constructor(private readonly transaction: Transaction) {}

  private async resolveTarget(input: ReservationRequest, lock: boolean) {
    const query = this.transaction
      .select({ id: spaces.id })
      .from(spaces)
      .where(
        and(
          eq(spaces.id, input.spaceId),
          eq(spaces.laboratoryId, input.laboratoryId),
          eq(spaces.isActive, true),
        ),
      );
    const [space] = await (lock ? query.for("update") : query);
    if (!space) throw new ReservationTargetError();
    if (!input.resourceIds.length) return;
    const resourceQuery = this.transaction
      .select({ id: resources.id })
      .from(resources)
      .where(
        and(
          eq(resources.spaceId, input.spaceId),
          eq(resources.isActive, true),
          inArray(resources.id, [...input.resourceIds]),
        ),
      )
      .orderBy(asc(resources.id));
    const selected = await (lock ? resourceQuery.for("share") : resourceQuery);
    if (selected.length !== input.resourceIds.length)
      throw new ReservationTargetError();
  }

  private async hydrate(
    rows: (typeof reservations.$inferSelect)[],
  ): Promise<Reservation[]> {
    if (!rows.length) return [];
    const links = await this.transaction
      .select()
      .from(reservationResources)
      .where(
        inArray(
          reservationResources.reservationId,
          rows.map((row) => row.id),
        ),
      );
    return rows.map((row) => ({
      ...row,
      resourceIds: links
        .filter((link) => link.reservationId === row.id)
        .map((link) => link.resourceId)
        .sort(),
    }));
  }

  async checkAvailability(input: ReservationRequest) {
    await this.resolveTarget(input, false);
    const rows = await this.transaction
      .select()
      .from(reservations)
      .where(
        and(
          eq(reservations.spaceId, input.spaceId),
          eq(reservations.status, "confirmed"),
          sql`${reservations.startsAt} < ${input.endsAt} and ${reservations.endsAt} > ${input.startsAt}`,
        ),
      );
    const candidates = await this.hydrate(rows);
    return {
      available: !candidates.some((candidate) => conflicts(input, candidate)),
    };
  }

  async create(input: ReservationRequest) {
    await this.resolveTarget(input, true);
    // Check after any wait for locks; the database also enforces the temporal rule.
    requireFutureStart(input, new Date());
    if (!(await this.checkAvailability(input)).available)
      throw new ReservationConflictError();
    const [row] = await this.transaction
      .insert(reservations)
      .values({
        spaceId: input.spaceId,
        createdBy: input.actorUserId,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        isExclusive: input.isExclusive,
      })
      .returning();
    if (input.resourceIds.length)
      await this.transaction.insert(reservationResources).values(
        input.resourceIds.map((resourceId) => ({
          reservationId: row.id,
          spaceId: row.spaceId,
          resourceId,
        })),
      );
    return { ...row, resourceIds: input.resourceIds };
  }

  async get(input: ActorContext & { reservationId: string }) {
    const rows = await this.transaction
      .select({ reservation: reservations })
      .from(reservations)
      .innerJoin(spaces, eq(spaces.id, reservations.spaceId))
      .where(
        and(
          eq(reservations.id, input.reservationId),
          eq(reservations.createdBy, input.actorUserId),
          eq(spaces.laboratoryId, input.laboratoryId),
        ),
      );
    const [result] = await this.hydrate(rows.map((row) => row.reservation));
    if (!result) throw new ReservationNotFoundError();
    return result;
  }

  async listMine(input: ActorContext) {
    const rows = await this.transaction
      .select({ reservation: reservations })
      .from(reservations)
      .innerJoin(spaces, eq(spaces.id, reservations.spaceId))
      .where(
        and(
          eq(reservations.createdBy, input.actorUserId),
          eq(spaces.laboratoryId, input.laboratoryId),
        ),
      )
      .orderBy(asc(reservations.startsAt), asc(reservations.id));
    return this.hydrate(rows.map((row) => row.reservation));
  }

  async cancel(input: ActorContext & { reservationId: string }) {
    const current = await this.get(input);
    // Same order as creation: space before reservation. No active filter: retain access to history.
    await this.transaction
      .select({ id: spaces.id })
      .from(spaces)
      .where(eq(spaces.id, current.spaceId))
      .for("update");
    await this.transaction
      .select({ id: reservations.id })
      .from(reservations)
      .where(eq(reservations.id, current.id))
      .for("update");
    const locked = await this.get(input);
    requireCancellable(locked, new Date());
    if (locked.status === "cancelled") return locked;
    const [row] = await this.transaction
      .update(reservations)
      .set({ status: "cancelled", cancelledAt: new Date() })
      .where(eq(reservations.id, locked.id))
      .returning();
    return { ...row, resourceIds: locked.resourceIds };
  }
}

export class DrizzleReservationStore implements ReservationStore {
  constructor(private readonly database: Database) {}

  async run<T>(
    context: ActorContext,
    permission: PermissionKey,
    operation: (session: ReservationSession) => Promise<T>,
  ): Promise<T> {
    if (!isSpatialId(context.actorUserId) || !isSpatialId(context.laboratoryId))
      throw new AuthorizationDeniedError();
    try {
      return await this.database.transaction(
        async (transaction) => {
          // Lock the concrete permission path, then use the existing authorization policy.
          // Revocation/deactivation cannot commit until this operation finishes.
          await transaction
            .select({ id: laboratoryMemberships.id })
            .from(users)
            .innerJoin(
              laboratoryMemberships,
              and(
                eq(laboratoryMemberships.userId, users.id),
                eq(laboratoryMemberships.laboratoryId, context.laboratoryId),
              ),
            )
            .innerJoin(
              laboratories,
              eq(laboratories.id, laboratoryMemberships.laboratoryId),
            )
            .innerJoin(
              membershipRoles,
              eq(membershipRoles.membershipId, laboratoryMemberships.id),
            )
            .innerJoin(roles, eq(roles.id, membershipRoles.roleId))
            .innerJoin(rolePermissions, eq(rolePermissions.roleId, roles.id))
            .innerJoin(
              permissions,
              and(
                eq(permissions.id, rolePermissions.permissionId),
                eq(permissions.key, permission),
              ),
            )
            .where(eq(users.id, context.actorUserId))
            .for("share");
          await new AuthorizationService(
            new DrizzleAuthorizationReader(transaction),
          ).authorize({ ...context, requiredPermission: permission });
          return operation(new DrizzleReservationSession(transaction));
        },
        { isolationLevel: "read committed" },
      );
    } catch (error) {
      const code = postgresCode(error);
      if (code === "23P01") throw new ReservationConflictError();
      if (code === "23503") throw new ReservationTargetError();
      if (code === "23514")
        throw new ReservationInputError("Reservation invariant rejected.");
      throw error;
    }
  }
}
