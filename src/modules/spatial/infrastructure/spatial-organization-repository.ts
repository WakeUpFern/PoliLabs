import { and, asc, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { PermissionKey } from "@/modules/identity/domain/access-catalog";
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
import type {
  LocationReader,
  LocationWriter,
  LocationWriteResult,
  ResourceReader,
  ResourceWriter,
  ResourceWriteResult,
} from "../application/spatial-organization-repository";
import { locations, resources, spaces } from "./spatial-schema";

type SpatialDatabase = NodePgDatabase<typeof databaseSchema>;
type SpatialTransaction = Parameters<
  Parameters<SpatialDatabase["transaction"]>[0]
>[0];

const locationSelection = {
  id: locations.id,
  spaceId: locations.spaceId,
  parentId: locations.parentId,
  name: locations.name,
  isActive: locations.isActive,
};

const resourceSelection = {
  id: resources.id,
  spaceId: resources.spaceId,
  locationId: resources.locationId,
  name: resources.name,
  isActive: resources.isActive,
};

async function canWrite(
  transaction: SpatialTransaction,
  input: {
    actorUserId: string;
    laboratoryId: string;
    spaceId: string;
    requiredPermission: PermissionKey;
  },
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
      spaces,
      and(
        eq(spaces.id, input.spaceId),
        eq(spaces.laboratoryId, input.laboratoryId),
        eq(spaces.isActive, true),
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
        eq(permissions.key, input.requiredPermission),
      ),
    )
    .where(and(eq(users.id, input.actorUserId), eq(users.isActive, true)))
    .limit(1)
    .for("update");

  return Boolean(authorization);
}

async function lockActiveLocations(
  transaction: SpatialTransaction,
  spaceId: string,
) {
  return transaction
    .select({ id: locations.id, parentId: locations.parentId })
    .from(locations)
    .where(and(eq(locations.spaceId, spaceId), eq(locations.isActive, true)))
    .for("update");
}

function parentIsValid(
  rows: readonly { id: string; parentId: string | null }[],
  parentId: string | null,
) {
  return parentId === null || rows.some(({ id }) => id === parentId);
}

function createsCycle(
  rows: readonly { id: string; parentId: string | null }[],
  locationId: string,
  parentId: string | null,
) {
  const parents = new Map(rows.map((row) => [row.id, row.parentId]));
  let cursor = parentId;
  const visited = new Set<string>();
  while (cursor) {
    if (cursor === locationId || visited.has(cursor)) return true;
    visited.add(cursor);
    cursor = parents.get(cursor) ?? null;
  }
  return false;
}

export class DrizzleSpatialOrganizationRepository
  implements LocationReader, ResourceReader, LocationWriter, ResourceWriter
{
  constructor(private readonly database: SpatialDatabase) {}

  async listActiveLocations(input: { laboratoryId: string; spaceId: string }) {
    return this.database
      .select(locationSelection)
      .from(locations)
      .innerJoin(
        spaces,
        and(
          eq(spaces.id, locations.spaceId),
          eq(spaces.laboratoryId, input.laboratoryId),
          eq(spaces.isActive, true),
        ),
      )
      .where(
        and(eq(locations.spaceId, input.spaceId), eq(locations.isActive, true)),
      )
      .orderBy(asc(locations.name), asc(locations.id));
  }

  async listActiveResources(input: { laboratoryId: string; spaceId: string }) {
    return this.database
      .select(resourceSelection)
      .from(resources)
      .innerJoin(
        spaces,
        and(
          eq(spaces.id, resources.spaceId),
          eq(spaces.laboratoryId, input.laboratoryId),
          eq(spaces.isActive, true),
        ),
      )
      .where(
        and(eq(resources.spaceId, input.spaceId), eq(resources.isActive, true)),
      )
      .orderBy(asc(resources.name), asc(resources.id));
  }

  async createLocation(
    input: Parameters<LocationWriter["createLocation"]>[0],
  ): Promise<LocationWriteResult> {
    return this.database.transaction(async (transaction) => {
      if (!(await canWrite(transaction, input)))
        return { status: "unauthorized" as const };
      const hierarchy = await lockActiveLocations(transaction, input.spaceId);
      if (!parentIsValid(hierarchy, input.parentId))
        return { status: "invalid-parent" as const };
      const [location] = await transaction
        .insert(locations)
        .values({
          spaceId: input.spaceId,
          parentId: input.parentId,
          name: input.name,
        })
        .returning(locationSelection);
      return { status: "created" as const, location };
    });
  }

  async updateLocation(
    input: Parameters<LocationWriter["updateLocation"]>[0],
  ): Promise<LocationWriteResult> {
    return this.database.transaction(async (transaction) => {
      if (!(await canWrite(transaction, input)))
        return { status: "unauthorized" as const };
      const hierarchy = await lockActiveLocations(transaction, input.spaceId);
      if (!hierarchy.some(({ id }) => id === input.locationId))
        return { status: "not-found" as const };
      if (!parentIsValid(hierarchy, input.parentId))
        return { status: "invalid-parent" as const };
      if (createsCycle(hierarchy, input.locationId, input.parentId))
        return { status: "cycle" as const };
      const [location] = await transaction
        .update(locations)
        .set({
          name: input.name,
          parentId: input.parentId,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(locations.id, input.locationId),
            eq(locations.spaceId, input.spaceId),
            eq(locations.isActive, true),
          ),
        )
        .returning(locationSelection);
      return location
        ? { status: "updated" as const, location }
        : { status: "not-found" as const };
    });
  }

  async deactivateLocation(
    input: Parameters<LocationWriter["deactivateLocation"]>[0],
  ): Promise<LocationWriteResult> {
    return this.database.transaction(async (transaction) => {
      if (!(await canWrite(transaction, input)))
        return { status: "unauthorized" as const };
      const [location] = await transaction
        .select({ id: locations.id })
        .from(locations)
        .where(
          and(
            eq(locations.id, input.locationId),
            eq(locations.spaceId, input.spaceId),
            eq(locations.isActive, true),
          ),
        )
        .limit(1)
        .for("update");
      if (!location) return { status: "not-found" as const };

      const [activeChild] = await transaction
        .select({ id: locations.id })
        .from(locations)
        .where(
          and(
            eq(locations.spaceId, input.spaceId),
            eq(locations.parentId, location.id),
            eq(locations.isActive, true),
          ),
        )
        .limit(1)
        .for("update");
      const [activeResource] = await transaction
        .select({ id: resources.id })
        .from(resources)
        .where(
          and(
            eq(resources.spaceId, input.spaceId),
            eq(resources.locationId, location.id),
            eq(resources.isActive, true),
          ),
        )
        .limit(1)
        .for("update");
      if (activeChild || activeResource)
        return { status: "has-active-dependents" as const };

      await transaction
        .update(locations)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(locations.id, location.id));
      return { status: "deactivated" as const };
    });
  }

  async createResource(
    input: Parameters<ResourceWriter["createResource"]>[0],
  ): Promise<ResourceWriteResult> {
    return this.database.transaction(async (transaction) => {
      if (!(await canWrite(transaction, input)))
        return { status: "unauthorized" as const };
      const hierarchy = await lockActiveLocations(transaction, input.spaceId);
      if (!parentIsValid(hierarchy, input.locationId))
        return { status: "invalid-location" as const };
      const [resource] = await transaction
        .insert(resources)
        .values({
          spaceId: input.spaceId,
          locationId: input.locationId,
          name: input.name,
        })
        .returning(resourceSelection);
      return { status: "created" as const, resource };
    });
  }

  async updateResource(
    input: Parameters<ResourceWriter["updateResource"]>[0],
  ): Promise<ResourceWriteResult> {
    return this.database.transaction(async (transaction) => {
      if (!(await canWrite(transaction, input)))
        return { status: "unauthorized" as const };
      const hierarchy = await lockActiveLocations(transaction, input.spaceId);
      if (!parentIsValid(hierarchy, input.locationId))
        return { status: "invalid-location" as const };
      const [resource] = await transaction
        .update(resources)
        .set({
          name: input.name,
          locationId: input.locationId,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(resources.id, input.resourceId),
            eq(resources.spaceId, input.spaceId),
            eq(resources.isActive, true),
          ),
        )
        .returning(resourceSelection);
      return resource
        ? { status: "updated" as const, resource }
        : { status: "not-found" as const };
    });
  }

  async deactivateResource(
    input: Parameters<ResourceWriter["deactivateResource"]>[0],
  ): Promise<ResourceWriteResult> {
    return this.database.transaction(async (transaction) => {
      if (!(await canWrite(transaction, input)))
        return { status: "unauthorized" as const };
      const [resource] = await transaction
        .update(resources)
        .set({ isActive: false, updatedAt: new Date() })
        .where(
          and(
            eq(resources.id, input.resourceId),
            eq(resources.spaceId, input.spaceId),
            eq(resources.isActive, true),
          ),
        )
        .returning({ id: resources.id });
      return resource
        ? { status: "deactivated" as const }
        : { status: "not-found" as const };
    });
  }
}
