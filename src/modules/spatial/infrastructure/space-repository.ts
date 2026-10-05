import { SpaceHasInventoryStockError } from "../domain/space";
import { isInventoryStockGuard } from "./inventory-stock-guard";
import { and, asc, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type {
  SpaceReader,
  SpaceWriteResult,
  SpaceWriter,
} from "../application/space-repository";
import { INITIAL_PERMISSIONS } from "@/modules/identity/domain/access-catalog";
import {
  laboratories,
  laboratoryMemberships,
  membershipRoles,
  permissions,
  rolePermissions,
  roles,
} from "@/modules/identity/infrastructure/access-schema";
import { users } from "@/modules/identity/infrastructure/auth-schema";
import * as databaseSchema from "@/infrastructure/database/schema";
import { spaces } from "./spatial-schema";

export type SpatialDatabase = NodePgDatabase<typeof databaseSchema>;
type SpatialTransaction = Parameters<
  Parameters<SpatialDatabase["transaction"]>[0]
>[0];

function hasPostgresCode(error: unknown, code: string): boolean {
  if (!error || typeof error !== "object") return false;
  if ("code" in error && error.code === code) return true;
  return "cause" in error && hasPostgresCode(error.cause, code);
}

async function canManage(
  transaction: SpatialTransaction,
  input: { actorUserId: string; laboratoryId: string },
) {
  const [authorization] = await transaction
    .select({ membershipId: laboratoryMemberships.id })
    .from(users)
    .innerJoin(
      laboratoryMemberships,
      and(
        eq(laboratoryMemberships.userId, users.id),
        eq(laboratoryMemberships.laboratoryId, input.laboratoryId),
        eq(laboratoryMemberships.isActive, true),
      ),
    )
    .innerJoin(
      laboratories,
      and(
        eq(laboratories.id, laboratoryMemberships.laboratoryId),
        eq(laboratories.isActive, true),
      ),
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
        eq(permissions.key, INITIAL_PERMISSIONS.spaceManage.key),
      ),
    )
    .where(and(eq(users.id, input.actorUserId), eq(users.isActive, true)))
    .limit(1)
    .for("update");

  return Boolean(authorization);
}

const spaceSelection = {
  id: spaces.id,
  laboratoryId: spaces.laboratoryId,
  slug: spaces.slug,
  name: spaces.name,
  capacity: spaces.capacity,
  isActive: spaces.isActive,
};

export class DrizzleSpaceRepository implements SpaceReader, SpaceWriter {
  constructor(private readonly database: SpatialDatabase) {}

  async listActive(laboratoryId: string) {
    return this.database
      .select(spaceSelection)
      .from(spaces)
      .where(
        and(eq(spaces.laboratoryId, laboratoryId), eq(spaces.isActive, true)),
      )
      .orderBy(asc(spaces.name), asc(spaces.slug));
  }

  async findActiveBySlug(input: { laboratoryId: string; slug: string }) {
    const [space] = await this.database
      .select(spaceSelection)
      .from(spaces)
      .where(
        and(
          eq(spaces.laboratoryId, input.laboratoryId),
          eq(spaces.slug, input.slug),
          eq(spaces.isActive, true),
        ),
      )
      .limit(1);
    return space ?? null;
  }

  async create(
    input: Parameters<SpaceWriter["create"]>[0],
  ): Promise<SpaceWriteResult> {
    try {
      return await this.database.transaction(async (transaction) => {
        if (!(await canManage(transaction, input)))
          return { status: "unauthorized" as const };

        const [space] = await transaction
          .insert(spaces)
          .values({
            laboratoryId: input.laboratoryId,
            name: input.name,
            slug: input.slug,
            capacity: input.capacity,
          })
          .returning(spaceSelection);
        return { status: "created" as const, space };
      });
    } catch (error) {
      if (hasPostgresCode(error, "23505")) return { status: "duplicate" };
      throw error;
    }
  }

  async update(
    input: Parameters<SpaceWriter["update"]>[0],
  ): Promise<SpaceWriteResult> {
    try {
      return await this.database.transaction(async (transaction) => {
        if (!(await canManage(transaction, input)))
          return { status: "unauthorized" as const };

        const [space] = await transaction
          .update(spaces)
          .set({
            name: input.name,
            slug: input.slug,
            capacity: input.capacity,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(spaces.laboratoryId, input.laboratoryId),
              eq(spaces.slug, input.currentSlug),
              eq(spaces.isActive, true),
            ),
          )
          .returning(spaceSelection);
        return space
          ? { status: "updated" as const, space }
          : { status: "not-found" as const };
      });
    } catch (error) {
      if (hasPostgresCode(error, "23505")) return { status: "duplicate" };
      throw error;
    }
  }

  async deactivate(
    input: Parameters<SpaceWriter["deactivate"]>[0],
  ): Promise<SpaceWriteResult> {
    try {
      return await this.database.transaction(async (transaction) => {
        if (!(await canManage(transaction, input)))
          return { status: "unauthorized" as const };

        const updated = await transaction
          .update(spaces)
          .set({ isActive: false, updatedAt: new Date() })
          .where(
            and(
              eq(spaces.laboratoryId, input.laboratoryId),
              eq(spaces.slug, input.slug),
              eq(spaces.isActive, true),
            ),
          )
          .returning({ id: spaces.id });
        return updated.length > 0
          ? { status: "deactivated" as const }
          : { status: "not-found" as const };
      });
    } catch (error) {
      if (isInventoryStockGuard(error)) throw new SpaceHasInventoryStockError();
      throw error;
    }
  }
}
