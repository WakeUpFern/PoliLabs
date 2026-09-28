import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { AuthorizationService } from "../../src/modules/identity/application/authorization-service";
import { INITIAL_PERMISSIONS } from "../../src/modules/identity/domain/access-catalog";
import { AuthorizationDeniedError } from "../../src/modules/identity/domain/access-errors";
import { DrizzleAuthorizationReader } from "../../src/modules/identity/infrastructure/access-repository";
import {
  laboratories,
  laboratoryMemberships,
  membershipRoles,
  permissions,
  rolePermissions,
  roles,
} from "../../src/modules/identity/infrastructure/access-schema";
import { users } from "../../src/modules/identity/infrastructure/auth-schema";
import { ListLocations } from "../../src/modules/spatial/application/list-locations";
import { ListResources } from "../../src/modules/spatial/application/list-resources";
import {
  CreateLocation,
  DeactivateLocation,
  UpdateLocation,
} from "../../src/modules/spatial/application/manage-locations";
import {
  CreateResource,
  DeactivateResource,
  UpdateResource,
} from "../../src/modules/spatial/application/manage-resources";
import {
  InvalidLocationParentError,
  LocationCycleError,
  LocationHasActiveDependentsError,
} from "../../src/modules/spatial/domain/location";
import { InvalidResourceLocationError } from "../../src/modules/spatial/domain/resource";
import { DrizzleSpatialOrganizationRepository } from "../../src/modules/spatial/infrastructure/spatial-organization-repository";
import {
  locations,
  resources,
  spaces,
} from "../../src/modules/spatial/infrastructure/spatial-schema";
import * as schema from "../../src/infrastructure/database/schema";
import { prepareIntegrationDatabase } from "./database";

function hasPostgresCode(error: unknown, code: string): boolean {
  if (!error || typeof error !== "object") return false;
  if ("code" in error && error.code === code) return true;
  return "cause" in error && hasPostgresCode(error.cause, code);
}

test("Spatial II preserves hierarchy, resource scope and authorization", async (context) => {
  const databaseUrl = await prepareIntegrationDatabase();
  const pool = new Pool({ connectionString: databaseUrl, max: 4 });
  const database = drizzle(pool, { schema });
  const suffix = randomUUID();
  const permissionCatalog = [
    INITIAL_PERMISSIONS.locationRead,
    INITIAL_PERMISSIONS.locationManage,
    INITIAL_PERMISSIONS.resourceRead,
    INITIAL_PERMISSIONS.resourceManage,
  ];

  const createdUsers = await database
    .insert(users)
    .values([
      {
        name: "Spatial II manager",
        email: `spatial2-manager-${suffix}@invalid.test`,
      },
      {
        name: "Spatial II reader",
        email: `spatial2-reader-${suffix}@invalid.test`,
      },
      {
        name: "Spatial II denied",
        email: `spatial2-denied-${suffix}@invalid.test`,
      },
      {
        name: "Spatial II outsider",
        email: `spatial2-outsider-${suffix}@invalid.test`,
      },
    ])
    .returning({ id: users.id });
  const [manager, reader, denied, outsider] = createdUsers;
  const [laboratoryA, laboratoryB] = await database
    .insert(laboratories)
    .values([
      { name: "Spatial II laboratory A", slug: `spatial-ii-a-${suffix}` },
      { name: "Spatial II laboratory B", slug: `spatial-ii-b-${suffix}` },
    ])
    .returning({ id: laboratories.id });
  const [spaceA, spaceA2, spaceB] = await database
    .insert(spaces)
    .values([
      {
        laboratoryId: laboratoryA.id,
        name: "Sala principal",
        slug: `main-${suffix}`,
      },
      {
        laboratoryId: laboratoryA.id,
        name: "Sala secundaria",
        slug: `secondary-${suffix}`,
      },
      {
        laboratoryId: laboratoryB.id,
        name: "Sala externa",
        slug: `external-${suffix}`,
      },
    ])
    .returning({ id: spaces.id });

  await database
    .insert(permissions)
    .values(permissionCatalog)
    .onConflictDoNothing();
  const createdPermissions = await database
    .select({ id: permissions.id, key: permissions.key })
    .from(permissions)
    .where(
      inArray(
        permissions.key,
        permissionCatalog.map(({ key }) => key),
      ),
    );
  const [managerRole, readerRole] = await database
    .insert(roles)
    .values([
      {
        key: `spatial2-manager-${suffix}`,
        name: "Spatial II manager",
        description: "Integration fixture",
      },
      {
        key: `spatial2-reader-${suffix}`,
        name: "Spatial II reader",
        description: "Integration fixture",
      },
    ])
    .returning({ id: roles.id });
  await database.insert(rolePermissions).values([
    ...createdPermissions.map(({ id }) => ({
      roleId: managerRole.id,
      permissionId: id,
    })),
    ...createdPermissions
      .filter(({ key }) => key.endsWith(".read"))
      .map(({ id }) => ({ roleId: readerRole.id, permissionId: id })),
  ]);
  const memberships = await database
    .insert(laboratoryMemberships)
    .values([
      { userId: manager.id, laboratoryId: laboratoryA.id },
      { userId: reader.id, laboratoryId: laboratoryA.id },
      { userId: denied.id, laboratoryId: laboratoryA.id },
      { userId: outsider.id, laboratoryId: laboratoryB.id },
    ])
    .returning({
      id: laboratoryMemberships.id,
      userId: laboratoryMemberships.userId,
    });
  const membershipFor = (userId: string) => {
    const membership = memberships.find((item) => item.userId === userId);
    assert.ok(membership);
    return membership;
  };
  await database.insert(membershipRoles).values([
    { membershipId: membershipFor(manager.id).id, roleId: managerRole.id },
    { membershipId: membershipFor(reader.id).id, roleId: readerRole.id },
    { membershipId: membershipFor(outsider.id).id, roleId: managerRole.id },
  ]);

  const authorization = new AuthorizationService(
    new DrizzleAuthorizationReader(database),
  );
  const repository = new DrizzleSpatialOrganizationRepository(database);
  const listLocations = new ListLocations(authorization, repository);
  const listResources = new ListResources(authorization, repository);
  const createLocation = new CreateLocation(authorization, repository);
  const updateLocation = new UpdateLocation(authorization, repository);
  const deactivateLocation = new DeactivateLocation(authorization, repository);
  const createResource = new CreateResource(authorization, repository);
  const updateResource = new UpdateResource(authorization, repository);
  const deactivateResource = new DeactivateResource(authorization, repository);

  const managerContext = {
    actorUserId: manager.id,
    laboratoryId: laboratoryA.id,
    spaceId: spaceA.id,
  };

  try {
    let parentId = "";
    let childId = "";
    let resourceId = "";

    await context.test(
      "creates a valid hierarchy and authorizes reads",
      async () => {
        const parent = await createLocation.execute({
          ...managerContext,
          name: " Área de tornos ",
        });
        const child = await createLocation.execute({
          ...managerContext,
          name: "Zona norte",
          parentId: parent.id,
        });
        parentId = parent.id;
        childId = child.id;

        const managerCatalog = await listLocations.execute(managerContext);
        assert.equal(managerCatalog.canManage, true);
        assert.deepEqual(
          new Set(managerCatalog.locations.map(({ id }) => id)),
          new Set([parent.id, child.id]),
        );
        const readerCatalog = await listLocations.execute({
          ...managerContext,
          actorUserId: reader.id,
        });
        assert.equal(readerCatalog.canManage, false);
        await assert.rejects(
          listLocations.execute({ ...managerContext, actorUserId: denied.id }),
          AuthorizationDeniedError,
        );
      },
    );

    await context.test(
      "rejects cross-space parents, self-parent and cycles",
      async () => {
        const [other] = await database
          .insert(locations)
          .values({ spaceId: spaceA2.id, name: "Other space" })
          .returning({ id: locations.id });
        await assert.rejects(
          updateLocation.execute({
            ...managerContext,
            locationId: childId,
            name: "Zona norte",
            parentId: other.id,
          }),
          InvalidLocationParentError,
        );
        await assert.rejects(
          updateLocation.execute({
            ...managerContext,
            locationId: childId,
            name: "Zona norte",
            parentId: childId,
          }),
          LocationCycleError,
        );
        await assert.rejects(
          updateLocation.execute({
            ...managerContext,
            locationId: parentId,
            name: "Área de tornos",
            parentId: childId,
          }),
          LocationCycleError,
        );
      },
    );

    await context.test(
      "edits and conservatively deactivates locations",
      async () => {
        const updated = await updateLocation.execute({
          ...managerContext,
          locationId: childId,
          name: " Zona norte actualizada ",
          parentId: parentId,
        });
        assert.equal(updated.name, "Zona norte actualizada");
        await assert.rejects(
          deactivateLocation.execute({
            ...managerContext,
            locationId: parentId,
          }),
          LocationHasActiveDependentsError,
        );
        await deactivateLocation.execute({
          ...managerContext,
          locationId: childId,
        });
        const [stored] = await database
          .select({ isActive: locations.isActive })
          .from(locations)
          .where(eq(locations.id, childId));
        assert.equal(stored.isActive, false);
      },
    );

    await context.test(
      "creates, moves and unassigns an individual resource",
      async () => {
        const unlocated = await createResource.execute({
          ...managerContext,
          name: "Prensa hidráulica",
        });
        assert.equal(unlocated.locationId, null);
        const located = await createResource.execute({
          ...managerContext,
          name: "Torno 1",
          locationId: parentId,
        });
        resourceId = located.id;
        assert.equal(located.locationId, parentId);
        const moved = await updateResource.execute({
          ...managerContext,
          resourceId,
          name: "Torno 1 actualizado",
          locationId: null,
        });
        assert.equal(moved.locationId, null);
        assert.equal(moved.name, "Torno 1 actualizado");
        const catalog = await listResources.execute(managerContext);
        assert.equal(catalog.resources.length, 2);
      },
    );

    await context.test(
      "rejects resource locations from another space",
      async () => {
        const [otherLocation] = await database
          .insert(locations)
          .values({ spaceId: spaceB.id, name: "External location" })
          .returning({ id: locations.id });
        await assert.rejects(
          updateResource.execute({
            ...managerContext,
            resourceId,
            name: "Torno",
            locationId: otherLocation.id,
          }),
          InvalidResourceLocationError,
        );
      },
    );

    await context.test(
      "prevents cross-laboratory access and tampered ids",
      async () => {
        await assert.rejects(
          listResources.execute({
            actorUserId: manager.id,
            laboratoryId: laboratoryB.id,
            spaceId: spaceB.id,
          }),
          AuthorizationDeniedError,
        );
        const hidden = await listLocations.execute({
          ...managerContext,
          spaceId: spaceB.id,
        });
        assert.deepEqual(hidden.locations, []);
        await assert.rejects(
          createResource.execute({
            ...managerContext,
            spaceId: spaceB.id,
            name: "Cross-lab resource",
          }),
          AuthorizationDeniedError,
        );
        await assert.rejects(
          createLocation.execute({
            ...managerContext,
            actorUserId: reader.id,
            name: "No manage",
          }),
          AuthorizationDeniedError,
        );
      },
    );

    await context.test("soft-deactivates resources", async () => {
      await deactivateResource.execute({ ...managerContext, resourceId });
      const [stored] = await database
        .select({ isActive: resources.isActive })
        .from(resources)
        .where(eq(resources.id, resourceId));
      assert.equal(stored.isActive, false);
    });

    await context.test(
      "PostgreSQL enforces cross-space FKs, self-parent and cycles",
      async () => {
        const [directA, directB] = await database
          .insert(locations)
          .values([
            { spaceId: spaceA.id, name: "Direct A" },
            { spaceId: spaceA.id, name: "Direct B" },
          ])
          .returning({ id: locations.id });
        await assert.rejects(
          database
            .update(locations)
            .set({ parentId: directA.id })
            .where(eq(locations.id, directA.id)),
          (error) => hasPostgresCode(error, "23514"),
        );
        await database
          .update(locations)
          .set({ parentId: directA.id })
          .where(eq(locations.id, directB.id));
        await assert.rejects(
          database
            .update(locations)
            .set({ parentId: directB.id })
            .where(eq(locations.id, directA.id)),
          (error) => hasPostgresCode(error, "23514"),
        );
        const [foreign] = await database
          .insert(locations)
          .values({ spaceId: spaceB.id, name: "Foreign" })
          .returning({ id: locations.id });
        await assert.rejects(
          database.insert(resources).values({
            spaceId: spaceA.id,
            locationId: foreign.id,
            name: "Invalid relation",
          }),
          (error) => hasPostgresCode(error, "23503"),
        );
      },
    );
  } finally {
    await database
      .delete(resources)
      .where(inArray(resources.spaceId, [spaceA.id, spaceA2.id, spaceB.id]));
    await database
      .update(locations)
      .set({ parentId: null })
      .where(inArray(locations.spaceId, [spaceA.id, spaceA2.id, spaceB.id]));
    await database
      .delete(locations)
      .where(inArray(locations.spaceId, [spaceA.id, spaceA2.id, spaceB.id]));
    await database
      .delete(spaces)
      .where(inArray(spaces.id, [spaceA.id, spaceA2.id, spaceB.id]));
    await database.delete(membershipRoles).where(
      inArray(
        membershipRoles.membershipId,
        memberships.map(({ id }) => id),
      ),
    );
    await database.delete(laboratoryMemberships).where(
      inArray(
        laboratoryMemberships.id,
        memberships.map(({ id }) => id),
      ),
    );
    await database
      .delete(rolePermissions)
      .where(inArray(rolePermissions.roleId, [managerRole.id, readerRole.id]));
    await database
      .delete(roles)
      .where(inArray(roles.id, [managerRole.id, readerRole.id]));
    await database
      .delete(laboratories)
      .where(inArray(laboratories.id, [laboratoryA.id, laboratoryB.id]));
    await database.delete(users).where(
      inArray(
        users.id,
        createdUsers.map(({ id }) => id),
      ),
    );
    await pool.end();
  }
});
