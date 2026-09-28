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
import { ListSpaces } from "../../src/modules/spatial/application/list-spaces";
import {
  CreateSpace,
  DeactivateSpace,
  UpdateSpace,
} from "../../src/modules/spatial/application/manage-spaces";
import { DuplicateSpaceSlugError } from "../../src/modules/spatial/domain/space";
import { DrizzleSpaceRepository } from "../../src/modules/spatial/infrastructure/space-repository";
import { spaces } from "../../src/modules/spatial/infrastructure/spatial-schema";
import * as schema from "../../src/infrastructure/database/schema";
import { prepareIntegrationDatabase } from "./database";

function hasPostgresCode(error: unknown, code: string): boolean {
  if (!error || typeof error !== "object") return false;
  if ("code" in error && error.code === code) return true;
  return "cause" in error && hasPostgresCode(error.cause, code);
}

test("space catalog is constrained and isolated by laboratory", async (context) => {
  const databaseUrl = await prepareIntegrationDatabase();
  const pool = new Pool({ connectionString: databaseUrl, max: 4 });
  const database = drizzle(pool, { schema });
  const suffix = randomUUID();

  const [manager, outsider] = await database
    .insert(users)
    .values([
      { name: "Spatial manager", email: `manager-${suffix}@invalid.test` },
      { name: "Spatial outsider", email: `outsider-${suffix}@invalid.test` },
    ])
    .returning({ id: users.id });
  const [laboratoryA, laboratoryB] = await database
    .insert(laboratories)
    .values([
      { name: "Spatial laboratory A", slug: `spatial-a-${suffix}` },
      { name: "Spatial laboratory B", slug: `spatial-b-${suffix}` },
    ])
    .returning({ id: laboratories.id });
  await database
    .insert(permissions)
    .values([INITIAL_PERMISSIONS.spaceRead, INITIAL_PERMISSIONS.spaceManage])
    .onConflictDoNothing();
  const existingPermissions = await database
    .select({ id: permissions.id, key: permissions.key })
    .from(permissions)
    .where(
      inArray(permissions.key, [
        INITIAL_PERMISSIONS.spaceRead.key,
        INITIAL_PERMISSIONS.spaceManage.key,
      ]),
    );
  const readPermission = existingPermissions.find(
    ({ key }) => key === INITIAL_PERMISSIONS.spaceRead.key,
  );
  const managePermission = existingPermissions.find(
    ({ key }) => key === INITIAL_PERMISSIONS.spaceManage.key,
  );
  assert.ok(readPermission);
  assert.ok(managePermission);

  const [managerRole] = await database
    .insert(roles)
    .values({
      key: `space-manager-${suffix}`,
      name: "Space manager",
      description: "Spatial integration fixture",
    })
    .returning({ id: roles.id });
  await database.insert(rolePermissions).values([
    { roleId: managerRole.id, permissionId: readPermission.id },
    { roleId: managerRole.id, permissionId: managePermission.id },
  ]);
  const [managerMembership, outsiderMembership] = await database
    .insert(laboratoryMemberships)
    .values([
      { userId: manager.id, laboratoryId: laboratoryA.id },
      { userId: outsider.id, laboratoryId: laboratoryB.id },
    ])
    .returning({ id: laboratoryMemberships.id });
  await database.insert(membershipRoles).values({
    membershipId: managerMembership.id,
    roleId: managerRole.id,
  });

  const authorization = new AuthorizationService(
    new DrizzleAuthorizationReader(database),
  );
  const repository = new DrizzleSpaceRepository(database);
  const createSpace = new CreateSpace(authorization, repository);
  const updateSpace = new UpdateSpace(authorization, repository);
  const deactivateSpace = new DeactivateSpace(authorization, repository);
  const listSpaces = new ListSpaces(authorization, repository);

  try {
    await context.test("creates and lists an active space", async () => {
      const created = await createSpace.execute({
        actorUserId: manager.id,
        laboratoryId: laboratoryA.id,
        name: "  Aula de integración  ",
        slug: "  AULA-1  ",
        capacity: 20,
      });
      assert.equal(created.slug, "aula-1");
      const result = await listSpaces.execute({
        actorUserId: manager.id,
        laboratoryId: laboratoryA.id,
      });
      assert.equal(result.canManage, true);
      assert.deepEqual(
        result.spaces.map(({ id }) => id),
        [created.id],
      );
    });

    await context.test(
      "rejects a duplicate slug in one laboratory",
      async () => {
        await assert.rejects(
          createSpace.execute({
            actorUserId: manager.id,
            laboratoryId: laboratoryA.id,
            name: "Duplicate",
            slug: "aula-1",
          }),
          DuplicateSpaceSlugError,
        );
      },
    );

    await context.test(
      "allows the same slug in another laboratory",
      async () => {
        const inserted = await database
          .insert(spaces)
          .values({
            laboratoryId: laboratoryB.id,
            name: "Aula in laboratory B",
            slug: "aula-1",
          })
          .returning({ id: spaces.id });
        assert.equal(inserted.length, 1);
      },
    );

    await context.test("denies writes in another laboratory", async () => {
      const before = await database
        .select({ id: spaces.id })
        .from(spaces)
        .where(eq(spaces.laboratoryId, laboratoryB.id));
      await assert.rejects(
        createSpace.execute({
          actorUserId: manager.id,
          laboratoryId: laboratoryB.id,
          name: "Cross-laboratory attempt",
          slug: "unauthorized-space",
        }),
        AuthorizationDeniedError,
      );
      const after = await database
        .select({ id: spaces.id })
        .from(spaces)
        .where(eq(spaces.laboratoryId, laboratoryB.id));
      assert.deepEqual(after, before);
    });

    await context.test("updates only the scoped active space", async () => {
      const updated = await updateSpace.execute({
        actorUserId: manager.id,
        laboratoryId: laboratoryA.id,
        currentSlug: "aula-1",
        name: "Aula actualizada",
        slug: "aula-flexible",
        capacity: 30,
      });
      assert.equal(updated.slug, "aula-flexible");
      assert.equal(updated.capacity, 30);
    });

    await context.test("deactivation hides but preserves the row", async () => {
      await deactivateSpace.execute({
        actorUserId: manager.id,
        laboratoryId: laboratoryA.id,
        slug: "aula-flexible",
      });
      const result = await listSpaces.execute({
        actorUserId: manager.id,
        laboratoryId: laboratoryA.id,
      });
      assert.deepEqual(result.spaces, []);
      const [stored] = await database
        .select({ isActive: spaces.isActive })
        .from(spaces)
        .where(eq(spaces.slug, "aula-flexible"));
      assert.equal(stored.isActive, false);
    });

    await context.test("database rejects non-positive capacity", async () => {
      await assert.rejects(
        database.insert(spaces).values({
          laboratoryId: laboratoryA.id,
          name: "Invalid capacity",
          slug: "invalid-capacity",
          capacity: 0,
        }),
        (error) => hasPostgresCode(error, "23514"),
      );
    });
  } finally {
    await database
      .delete(spaces)
      .where(inArray(spaces.laboratoryId, [laboratoryA.id, laboratoryB.id]));
    await database
      .delete(membershipRoles)
      .where(eq(membershipRoles.membershipId, managerMembership.id));
    await database
      .delete(laboratoryMemberships)
      .where(eq(laboratoryMemberships.id, managerMembership.id));
    await database
      .delete(laboratoryMemberships)
      .where(eq(laboratoryMemberships.id, outsiderMembership.id));
    await database
      .delete(rolePermissions)
      .where(eq(rolePermissions.roleId, managerRole.id));
    await database.delete(roles).where(eq(roles.id, managerRole.id));
    await database
      .delete(laboratories)
      .where(eq(laboratories.id, laboratoryA.id));
    await database
      .delete(laboratories)
      .where(eq(laboratories.id, laboratoryB.id));
    await database.delete(users).where(eq(users.id, manager.id));
    await database.delete(users).where(eq(users.id, outsider.id));
    await database
      .delete(permissions)
      .where(
        inArray(permissions.key, [
          INITIAL_PERMISSIONS.spaceRead.key,
          INITIAL_PERMISSIONS.spaceManage.key,
        ]),
      );
    await pool.end();
  }
});
