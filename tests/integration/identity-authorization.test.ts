import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import test from "node:test";
import { count, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { AssignMembershipRole } from "../../src/modules/identity/application/assign-membership-role";
import { AuthorizationService } from "../../src/modules/identity/application/authorization-service";
import { BootstrapInstallation } from "../../src/modules/identity/application/bootstrap-installation";
import { GetLaboratory } from "../../src/modules/identity/application/get-laboratory";
import { INITIAL_PERMISSIONS } from "../../src/modules/identity/domain/access-catalog";
import {
  AuthorizationDeniedError,
  BootstrapAlreadyInitializedError,
  InvalidLaboratoryRelationError,
} from "../../src/modules/identity/domain/access-errors";
import {
  DrizzleAuthorizationReader,
  DrizzleLaboratoryReader,
  DrizzleMembershipRoleAssigner,
  type IdentityDatabase,
} from "../../src/modules/identity/infrastructure/access-repository";
import {
  laboratories,
  laboratoryMemberships,
  membershipRoles,
  permissions,
  rolePermissions,
  roles,
} from "../../src/modules/identity/infrastructure/access-schema";
import {
  BetterAuthLocalIdentityProvisioner,
  createBootstrapAuth,
} from "../../src/modules/identity/infrastructure/bootstrap-auth";
import { DrizzleBootstrapCoordinator } from "../../src/modules/identity/infrastructure/bootstrap-coordinator";
import {
  accounts,
  sessions,
  users,
  verifications,
} from "../../src/modules/identity/infrastructure/auth-schema";
import * as schema from "../../src/infrastructure/database/schema";
import { prepareIntegrationDatabase } from "./database";

async function clearIdentityData(database: IdentityDatabase) {
  await database.delete(rolePermissions);
  await database.delete(membershipRoles);
  await database.delete(sessions);
  await database.delete(accounts);
  await database.delete(laboratoryMemberships);
  await database.delete(permissions);
  await database.delete(roles);
  await database.delete(laboratories);
  await database.delete(verifications);
  await database.delete(users);
}

function hasPostgresCode(error: unknown, code: string): boolean {
  if (!error || typeof error !== "object") return false;
  if ("code" in error && error.code === code) return true;
  return "cause" in error && hasPostgresCode(error.cause, code);
}

test("authorization remains scoped to one active laboratory membership", async (context) => {
  const databaseUrl = await prepareIntegrationDatabase();
  const pool = new Pool({ connectionString: databaseUrl, max: 4 });
  const database = drizzle(pool, { schema });

  await clearIdentityData(database);
  try {
    const suffix = randomUUID();
    const [actor, withoutPermission, inactiveMembershipUser, inactiveUser] =
      await database
        .insert(users)
        .values([
          {
            name: "Authorized fixture",
            email: `authorized-${suffix}@invalid.test`,
          },
          {
            name: "No permission fixture",
            email: `no-permission-${suffix}@invalid.test`,
          },
          {
            name: "Inactive membership fixture",
            email: `inactive-membership-${suffix}@invalid.test`,
          },
          {
            name: "Inactive user fixture",
            email: `inactive-user-${suffix}@invalid.test`,
            isActive: false,
          },
        ])
        .returning({ id: users.id });

    const [laboratoryA, laboratoryB] = await database
      .insert(laboratories)
      .values([
        { slug: `laboratory-a-${suffix}`, name: "Laboratory A fixture" },
        { slug: `laboratory-b-${suffix}`, name: "Laboratory B fixture" },
      ])
      .returning({ id: laboratories.id, name: laboratories.name });

    const [readPermission, membershipPermission, assignPermission] =
      await database
        .insert(permissions)
        .values([
          INITIAL_PERMISSIONS.laboratoryRead,
          INITIAL_PERMISSIONS.laboratoryMembershipManage,
          INITIAL_PERMISSIONS.laboratoryRoleAssign,
        ])
        .returning({ id: permissions.id, key: permissions.key });

    const [readerRole, roleAssigner, membershipManager, emptyRole] =
      await database
        .insert(roles)
        .values([
          {
            key: `reader-${suffix}`,
            name: "Reader fixture",
            description: "Integration fixture",
          },
          {
            key: `role-assigner-${suffix}`,
            name: "Role assigner fixture",
            description: "Integration fixture",
          },
          {
            key: `membership-manager-${suffix}`,
            name: "Membership manager fixture",
            description: "Integration fixture",
          },
          {
            key: `empty-${suffix}`,
            name: "Empty fixture",
            description: "Integration fixture",
          },
        ])
        .returning({ id: roles.id, key: roles.key });

    await database.insert(rolePermissions).values([
      { roleId: readerRole.id, permissionId: readPermission.id },
      { roleId: roleAssigner.id, permissionId: assignPermission.id },
      {
        roleId: membershipManager.id,
        permissionId: membershipPermission.id,
      },
    ]);

    const [actorInA, actorInB, noPermissionInA, inactiveMembership, inactive] =
      await database
        .insert(laboratoryMemberships)
        .values([
          { userId: actor.id, laboratoryId: laboratoryA.id },
          { userId: actor.id, laboratoryId: laboratoryB.id },
          { userId: withoutPermission.id, laboratoryId: laboratoryA.id },
          {
            userId: inactiveMembershipUser.id,
            laboratoryId: laboratoryA.id,
            isActive: false,
          },
          { userId: inactiveUser.id, laboratoryId: laboratoryA.id },
        ])
        .returning({ id: laboratoryMemberships.id });

    await database.insert(membershipRoles).values([
      { membershipId: actorInA.id, roleId: readerRole.id },
      { membershipId: actorInA.id, roleId: roleAssigner.id },
      { membershipId: actorInB.id, roleId: membershipManager.id },
      { membershipId: noPermissionInA.id, roleId: emptyRole.id },
      { membershipId: inactiveMembership.id, roleId: readerRole.id },
      { membershipId: inactive.id, roleId: readerRole.id },
    ]);

    const authorization = new AuthorizationService(
      new DrizzleAuthorizationReader(database),
    );
    const getLaboratory = new GetLaboratory(
      authorization,
      new DrizzleLaboratoryReader(database),
    );
    const assignRole = new AssignMembershipRole(
      authorization,
      new DrizzleMembershipRoleAssigner(database),
    );

    await context.test("allows the authorized operation", async () => {
      const result = await getLaboratory.execute({
        actorUserId: actor.id,
        laboratoryId: laboratoryA.id,
      });
      assert.equal(result.name, laboratoryA.name);
    });

    await context.test("denies a membership without permission", async () => {
      await assert.rejects(
        getLaboratory.execute({
          actorUserId: withoutPermission.id,
          laboratoryId: laboratoryA.id,
        }),
        AuthorizationDeniedError,
      );
    });

    await context.test("denies an inactive membership", async () => {
      await assert.rejects(
        getLaboratory.execute({
          actorUserId: inactiveMembershipUser.id,
          laboratoryId: laboratoryA.id,
        }),
        AuthorizationDeniedError,
      );
    });

    await context.test("denies an inactive user", async () => {
      await assert.rejects(
        getLaboratory.execute({
          actorUserId: inactiveUser.id,
          laboratoryId: laboratoryA.id,
        }),
        AuthorizationDeniedError,
      );
    });

    await context.test(
      "combines two roles from the same membership",
      async () => {
        const grant = await authorization.authorize({
          actorUserId: actor.id,
          laboratoryId: laboratoryA.id,
          requiredPermission: INITIAL_PERMISSIONS.laboratoryRoleAssign.key,
        });
        assert.deepEqual(
          new Set(grant.roleKeys),
          new Set([readerRole.key, roleAssigner.key]),
        );
      },
    );

    await context.test(
      "does not combine a role from another laboratory",
      async () => {
        await assert.rejects(
          authorization.authorize({
            actorUserId: actor.id,
            laboratoryId: laboratoryA.id,
            requiredPermission:
              INITIAL_PERMISSIONS.laboratoryMembershipManage.key,
          }),
          AuthorizationDeniedError,
        );
      },
    );

    await context.test(
      "changing laboratoryId reveals no unauthorized laboratory data",
      async () => {
        await assert.rejects(
          getLaboratory.execute({
            actorUserId: actor.id,
            laboratoryId: laboratoryB.id,
          }),
          AuthorizationDeniedError,
        );
        const [unchanged] = await database
          .select({ name: laboratories.name })
          .from(laboratories)
          .where(eq(laboratories.id, laboratoryB.id));
        assert.equal(unchanged.name, laboratoryB.name);
      },
    );

    await context.test("rejects duplicate membership assignments", async () => {
      await assert.rejects(
        database.insert(laboratoryMemberships).values({
          userId: actor.id,
          laboratoryId: laboratoryA.id,
        }),
        (error) => hasPostgresCode(error, "23505"),
      );
      await assert.rejects(
        database.insert(membershipRoles).values({
          membershipId: actorInA.id,
          roleId: readerRole.id,
        }),
        (error) => hasPostgresCode(error, "23505"),
      );
    });

    await context.test(
      "rejects a membership relation from another laboratory",
      async () => {
        await assert.rejects(
          assignRole.execute({
            actorUserId: actor.id,
            laboratoryId: laboratoryA.id,
            membershipId: actorInB.id,
            roleKey: emptyRole.key,
          }),
          InvalidLaboratoryRelationError,
        );
      },
    );
  } finally {
    await clearIdentityData(database);
    await pool.end();
  }
});

test("controlled bootstrap creates exactly one local responsible", async () => {
  const databaseUrl = await prepareIntegrationDatabase();
  const pool = new Pool({ connectionString: databaseUrl, max: 4 });
  const database = drizzle(pool, { schema });

  await clearIdentityData(database);
  try {
    const bootstrapAuth = createBootstrapAuth(database);
    const bootstrap = new BootstrapInstallation(
      new BetterAuthLocalIdentityProvisioner(bootstrapAuth),
      new DrizzleBootstrapCoordinator(database),
    );
    const suffix = randomUUID();
    const password = randomBytes(24).toString("base64url");
    const input = {
      userName: "Bootstrap integration fixture",
      userEmail: `bootstrap-${suffix}@invalid.test`,
      password,
      laboratoryName: "Laboratorio de Pesados fixture",
      laboratorySlug: `laboratorio-de-pesados-${suffix}`,
    };

    const result = await bootstrap.execute(input);

    const [credential] = await database
      .select({ password: accounts.password })
      .from(accounts)
      .where(eq(accounts.userId, result.userId));
    assert.ok(credential.password);
    assert.notEqual(credential.password, password);

    const grant = await new AuthorizationService(
      new DrizzleAuthorizationReader(database),
    ).authorize({
      actorUserId: result.userId,
      laboratoryId: result.laboratoryId,
      requiredPermission: INITIAL_PERMISSIONS.laboratoryRead.key,
    });
    assert.equal(grant.permissionKeys.length, 3);

    await assert.rejects(
      bootstrap.execute({
        ...input,
        userEmail: `second-${suffix}@invalid.test`,
      }),
      BootstrapAlreadyInitializedError,
    );

    const signedIn = await bootstrapAuth.api.signInEmail({
      body: { email: input.userEmail, password },
      returnHeaders: true,
    });
    assert.equal(signedIn.response.user.id, result.userId);

    const cookie = signedIn.headers
      .getSetCookie()
      .map((value) => value.split(";", 1)[0])
      .join("; ");
    const authenticatedSession = await bootstrapAuth.api.getSession({
      headers: new Headers({ cookie }),
    });
    assert.ok(authenticatedSession);
    assert.equal(authenticatedSession.user.id, result.userId);

    await new AuthorizationService(
      new DrizzleAuthorizationReader(database),
    ).authorize({
      actorUserId: authenticatedSession.user.id,
      laboratoryId: result.laboratoryId,
      requiredPermission: INITIAL_PERMISSIONS.laboratoryRead.key,
    });

    const [{ value: userCount }] = await database
      .select({ value: count() })
      .from(users);
    assert.equal(userCount, 1);
  } finally {
    await clearIdentityData(database);
    await pool.end();
  }
});
