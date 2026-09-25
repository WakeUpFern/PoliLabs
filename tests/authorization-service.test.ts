import assert from "node:assert/strict";
import test from "node:test";
import {
  AuthorizationService,
  type AuthorizationReader,
  type AuthorizationSnapshot,
} from "../src/modules/identity/application/authorization-service";
import { INITIAL_PERMISSIONS } from "../src/modules/identity/domain/access-catalog";
import { AuthorizationDeniedError } from "../src/modules/identity/domain/access-errors";

const actorUserId = "10000000-0000-4000-8000-000000000001";
const laboratoryId = "20000000-0000-4000-8000-000000000001";

function snapshot(
  overrides: Partial<AuthorizationSnapshot> = {},
): AuthorizationSnapshot {
  return {
    actorUserId,
    laboratoryId,
    membershipId: "30000000-0000-4000-8000-000000000001",
    userIsActive: true,
    laboratoryIsActive: true,
    membershipIsActive: true,
    roleKeys: ["reader"],
    permissionKeys: [INITIAL_PERMISSIONS.laboratoryRead.key],
    ...overrides,
  };
}

function serviceWith(read: AuthorizationReader["readAuthorizationSnapshot"]) {
  return new AuthorizationService({ readAuthorizationSnapshot: read });
}

test("allows an active user with an active membership and permission", async () => {
  const authorization = serviceWith(async () => snapshot());

  const grant = await authorization.authorize({
    actorUserId,
    laboratoryId,
    requiredPermission: INITIAL_PERMISSIONS.laboratoryRead.key,
  });

  assert.equal(grant.membershipId, snapshot().membershipId);
});

test("denies a membership without the required permission", async () => {
  const authorization = serviceWith(async () =>
    snapshot({ permissionKeys: [] }),
  );

  await assert.rejects(
    authorization.authorize({
      actorUserId,
      laboratoryId,
      requiredPermission: INITIAL_PERMISSIONS.laboratoryRead.key,
    }),
    AuthorizationDeniedError,
  );
});

test("denies an inactive membership", async () => {
  const authorization = serviceWith(async () =>
    snapshot({ membershipIsActive: false }),
  );

  await assert.rejects(
    authorization.authorize({
      actorUserId,
      laboratoryId,
      requiredPermission: INITIAL_PERMISSIONS.laboratoryRead.key,
    }),
    AuthorizationDeniedError,
  );
});

test("denies an inactive user", async () => {
  const authorization = serviceWith(async () =>
    snapshot({ userIsActive: false }),
  );

  await assert.rejects(
    authorization.authorize({
      actorUserId,
      laboratoryId,
      requiredPermission: INITIAL_PERMISSIONS.laboratoryRead.key,
    }),
    AuthorizationDeniedError,
  );
});

test("combines permissions from multiple roles in one membership", async () => {
  const authorization = serviceWith(async () =>
    snapshot({
      roleKeys: ["reader", "role_assigner"],
      permissionKeys: [
        INITIAL_PERMISSIONS.laboratoryRead.key,
        INITIAL_PERMISSIONS.laboratoryRoleAssign.key,
      ],
    }),
  );

  const grant = await authorization.authorize({
    actorUserId,
    laboratoryId,
    requiredPermission: INITIAL_PERMISSIONS.laboratoryRoleAssign.key,
  });

  assert.deepEqual(grant.roleKeys, ["reader", "role_assigner"]);
});

test("uses only the requested laboratory snapshot", async () => {
  const otherLaboratoryId = "20000000-0000-4000-8000-000000000002";
  const authorization = serviceWith(async (input) =>
    input.laboratoryId === laboratoryId
      ? snapshot({ permissionKeys: [] })
      : snapshot({
          laboratoryId: otherLaboratoryId,
          permissionKeys: [INITIAL_PERMISSIONS.laboratoryMembershipManage.key],
        }),
  );

  await assert.rejects(
    authorization.authorize({
      actorUserId,
      laboratoryId,
      requiredPermission: INITIAL_PERMISSIONS.laboratoryMembershipManage.key,
    }),
    AuthorizationDeniedError,
  );
});

test("allows a use case to add a stricter restriction", async () => {
  const authorization = serviceWith(async () => snapshot());

  await assert.rejects(
    authorization.authorize({
      actorUserId,
      laboratoryId,
      requiredPermission: INITIAL_PERMISSIONS.laboratoryRead.key,
      additionalRestriction: () => false,
    }),
    AuthorizationDeniedError,
  );
});
