import assert from "node:assert/strict";
import test from "node:test";
import { GetCurrentUser } from "../src/modules/identity/application/get-current-user";
import { GetLaboratoryBySlug } from "../src/modules/identity/application/get-laboratory-by-slug";
import { GetUserLaboratories } from "../src/modules/identity/application/get-user-laboratories";
import { resolveSessionActor } from "../src/modules/identity/application/resolve-session-actor";
import {
  AuthorizationService,
  type AuthorizationSnapshot,
} from "../src/modules/identity/application/authorization-service";
import { INITIAL_PERMISSIONS } from "../src/modules/identity/domain/access-catalog";
import {
  AuthenticationRequiredError,
  AuthorizationDeniedError,
  InactiveUserError,
} from "../src/modules/identity/domain/access-errors";

const actorUserId = "10000000-0000-4000-8000-000000000001";
const laboratoryId = "20000000-0000-4000-8000-000000000001";

function authorizationSnapshot(): AuthorizationSnapshot {
  return {
    actorUserId,
    laboratoryId,
    membershipId: "30000000-0000-4000-8000-000000000001",
    userIsActive: true,
    laboratoryIsActive: true,
    membershipIsActive: true,
    roleKeys: ["laboratory_responsible"],
    permissionKeys: [INITIAL_PERMISSIONS.laboratoryRead.key],
  };
}

test("a valid session resolves only its actor user id", () => {
  assert.equal(resolveSessionActor({ user: { id: actorUserId } }), actorUserId);
  assert.throws(() => resolveSessionActor(null), AuthenticationRequiredError);
  assert.throws(
    () => resolveSessionActor({ user: null }),
    AuthenticationRequiredError,
  );
});

test("the protected shell accepts only an active authenticated user", async () => {
  const activeUser = new GetCurrentUser({
    findActiveById: async (id) => ({
      id,
      name: "Active fixture",
      email: "active@invalid.test",
    }),
  });
  assert.equal((await activeUser.execute(actorUserId)).id, actorUserId);

  const inactiveUser = new GetCurrentUser({
    findActiveById: async () => null,
  });
  await assert.rejects(inactiveUser.execute(actorUserId), InactiveUserError);
});

test("the laboratory list preserves only the reader result for the actor", async () => {
  const expected = [
    {
      id: laboratoryId,
      slug: "materials",
      name: "Materials fixture",
      roleKeys: ["reader"],
      roleNames: ["Reader"],
    },
  ];
  const useCase = new GetUserLaboratories({
    listActiveForUser: async (id) => (id === actorUserId ? expected : null),
  });

  assert.deepEqual(await useCase.execute(actorUserId), expected);
  await assert.rejects(
    useCase.execute("10000000-0000-4000-8000-000000000002"),
    InactiveUserError,
  );
});

test("a laboratory slug expresses intent but authorization decides access", async () => {
  const laboratories = {
    findActiveBySlug: async (slug: string) =>
      slug === "materials"
        ? { id: laboratoryId, slug, name: "Materials fixture" }
        : null,
  };
  const allowed = new GetLaboratoryBySlug(
    new AuthorizationService({
      readAuthorizationSnapshot: async () => authorizationSnapshot(),
    }),
    laboratories,
  );
  assert.equal(
    (await allowed.execute({ actorUserId, laboratorySlug: "materials" })).id,
    laboratoryId,
  );

  const denied = new GetLaboratoryBySlug(
    new AuthorizationService({
      readAuthorizationSnapshot: async () => ({
        ...authorizationSnapshot(),
        permissionKeys: [],
      }),
    }),
    laboratories,
  );
  await assert.rejects(
    denied.execute({ actorUserId, laboratorySlug: "materials" }),
    AuthorizationDeniedError,
  );
  await assert.rejects(
    allowed.execute({ actorUserId, laboratorySlug: "unknown" }),
    AuthorizationDeniedError,
  );
});
