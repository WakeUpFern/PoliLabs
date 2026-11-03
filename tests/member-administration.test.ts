import assert from "node:assert/strict";
import test from "node:test";
import {
  MemberAdministration,
  type MemberRecord,
  type MemberTransaction,
  type RoleRecord,
} from "../src/modules/identity/application/member-administration";
import type { AuthorizationGrant } from "../src/modules/identity/application/authorization-service";
import { LABORATORY_ROLE_CATALOG } from "../src/modules/identity/domain/access-catalog";
import {
  formatTemporaryPassword,
  MemberAdministrationError,
  memberValues,
  passwordChangePending,
  TEMPORARY_PASSWORD_BYTES,
  withinActorPermissions,
} from "../src/modules/identity/domain/member-administration";
import { createActions, labNavigation } from "../src/app/_shell/navigation";

const [responsible, teacher, student] = LABORATORY_ROLE_CATALOG;
const laboratoryId = "20000000-0000-4000-8000-000000000001";
const actorUserId = "10000000-0000-4000-8000-000000000001";

test("member values are trimmed, lowercased and validated", () => {
  assert.deepEqual(
    memberValues({ name: "  Ana   López ", email: " Ana@Alumno.IPN.mx " }),
    { name: "Ana López", email: "ana@alumno.ipn.mx" },
  );
  for (const input of [
    { name: "", email: "a@b.mx" },
    { name: "Ana", email: "sin-arroba" },
    { name: "x".repeat(121), email: "a@b.mx" },
  ])
    assert.throws(
      () => memberValues(input),
      (error) =>
        error instanceof MemberAdministrationError && error.code === "input",
    );
});

test("teachers can grant teacher and student roles but not responsible", () => {
  const can = (role: { permissions: readonly string[] }) =>
    withinActorPermissions(teacher.permissions, role.permissions);
  assert.equal(can(student), true);
  assert.equal(can(teacher), true);
  assert.equal(can(responsible), false);
  // Students hold no authority over others, so they can grant nothing beyond
  // self-service.
  assert.equal(
    withinActorPermissions(student.permissions, teacher.permissions),
    false,
  );
});

test("temporary passwords are long, unambiguous and grouped", () => {
  const bytes = Uint8Array.from(
    { length: TEMPORARY_PASSWORD_BYTES },
    (_, i) => i * 37,
  );
  const password = formatTemporaryPassword(bytes);
  assert.match(password, /^[a-z2-9]{5}(-[a-z2-9]{5}){3}$/);
  assert.ok(password.length >= 15);
  assert.doesNotMatch(password, /[lo01]/);
  assert.throws(() => formatTemporaryPassword(new Uint8Array(4)));
});

test("a temporary password stays pending until the credential changes", () => {
  const issued = new Date("2026-11-03T10:00:00Z");
  assert.equal(
    passwordChangePending({
      temporaryPasswordIssuedAt: null,
      credentialUpdatedAt: issued,
    }),
    false,
  );
  assert.equal(
    passwordChangePending({
      temporaryPasswordIssuedAt: issued,
      credentialUpdatedAt: issued,
    }),
    true,
  );
  assert.equal(
    passwordChangePending({
      temporaryPasswordIssuedAt: issued,
      credentialUpdatedAt: new Date("2026-11-03T10:05:00Z"),
    }),
    false,
  );
});

function roleRecords(): RoleRecord[] {
  return LABORATORY_ROLE_CATALOG.map((role, index) => ({
    id: `role-${index}`,
    key: role.key,
    name: role.name,
    description: role.description,
    permissionKeys: role.permissions,
  }));
}

function member(overrides: Partial<MemberRecord>): MemberRecord {
  return {
    membershipId: "30000000-0000-4000-8000-000000000002",
    userId: "10000000-0000-4000-8000-000000000002",
    name: "Alumno",
    email: "alumno@invalid.test",
    isActive: true,
    userIsActive: true,
    roleKeys: [student.key],
    roleNames: [student.name],
    permissionKeys: student.permissions,
    passwordChangePending: false,
    otherActiveLaboratories: 0,
    ...overrides,
  };
}

function harness(
  actorPermissions: readonly string[],
  target: MemberRecord | null,
) {
  const calls: string[] = [];
  const tx: MemberTransaction = {
    members: async () => (target ? [target] : []),
    member: async () => target,
    roles: async () => roleRecords(),
    findUserIdByEmail: async (email) =>
      email === "existente@invalid.test" ? "existing-user" : null,
    isMember: async () => false,
    createLocalUser: async (input) => {
      calls.push(`create:${input.email}:${input.passwordHash}`);
      return "new-user";
    },
    addMembership: async (input) => {
      calls.push(`member:${input.userId}:${input.roleId}`);
      return "new-membership";
    },
    replaceRoles: async (_, roleId) => {
      calls.push(`role:${roleId}`);
    },
    setMembershipActive: async (_, active) => {
      calls.push(`active:${active}`);
    },
    setTemporaryPassword: async (userId, hash) => {
      calls.push(`password:${userId}:${hash}`);
    },
  };
  const grant: AuthorizationGrant = {
    actorUserId,
    laboratoryId,
    membershipId: "30000000-0000-4000-8000-000000000001",
    roleKeys: [],
    permissionKeys: actorPermissions,
  };
  const service = new MemberAdministration(
    { run: async (_context, _permission, work) => work(tx, grant) },
    { generate: () => "temporal-12345-abcde", hash: async (p) => `hash(${p})` },
  );
  return { service, calls };
}

const rejectsWith = (code: string) => (error: unknown) =>
  error instanceof MemberAdministrationError && error.code === code;

test("creating an account hashes the temporary password and assigns the role", async () => {
  const { service, calls } = harness(teacher.permissions, null);
  const result = await service.create({
    actorUserId,
    laboratoryId,
    name: "Ana",
    email: "Ana@invalid.test",
    roleKey: student.key,
  });
  assert.equal(result.temporaryPassword, "temporal-12345-abcde");
  assert.deepEqual(calls, [
    "create:ana@invalid.test:hash(temporal-12345-abcde)",
    "member:new-user:role-2",
  ]);
});

test("an existing account only gains access and keeps its password", async () => {
  const { service, calls } = harness(teacher.permissions, null);
  const result = await service.create({
    actorUserId,
    laboratoryId,
    name: "Existente",
    email: "existente@invalid.test",
    roleKey: student.key,
  });
  assert.equal(result.temporaryPassword, null);
  assert.deepEqual(calls, ["member:existing-user:role-2"]);
});

test("a teacher cannot create or take over a responsible", async () => {
  const { service } = harness(
    teacher.permissions,
    member({
      roleKeys: [responsible.key],
      permissionKeys: responsible.permissions,
    }),
  );
  await assert.rejects(
    service.create({
      actorUserId,
      laboratoryId,
      name: "Otra",
      email: "otra@invalid.test",
      roleKey: responsible.key,
    }),
    rejectsWith("role"),
  );
  const target = { actorUserId, laboratoryId, membershipId: "m" };
  await assert.rejects(service.resetPassword(target), rejectsWith("protected"));
  await assert.rejects(
    service.setActive({ ...target, active: false }),
    rejectsWith("protected"),
  );
  await assert.rejects(
    service.changeRole({ ...target, roleKey: student.key }),
    rejectsWith("protected"),
  );
});

test("nobody changes their own access", async () => {
  const { service } = harness(
    responsible.permissions,
    member({ userId: actorUserId }),
  );
  await assert.rejects(
    service.setActive({
      actorUserId,
      laboratoryId,
      membershipId: "m",
      active: false,
    }),
    rejectsWith("self"),
  );
});

test("password reset is refused for accounts shared with other laboratories", async () => {
  const { service, calls } = harness(
    teacher.permissions,
    member({ otherActiveLaboratories: 1 }),
  );
  await assert.rejects(
    service.resetPassword({ actorUserId, laboratoryId, membershipId: "m" }),
    rejectsWith("shared-account"),
  );
  assert.deepEqual(calls, []);
});

test("overview lists only roles the actor may grant and marks manageable members", async () => {
  const { service } = harness(teacher.permissions, member({}));
  const overview = await service.overview({ actorUserId, laboratoryId });
  assert.deepEqual(
    overview.roles.map((role) => role.key),
    [teacher.key, student.key],
  );
  assert.equal(overview.members[0].canManage, true);
  assert.equal(overview.canAssignRoles, true);
});

test("lab sections follow the practice order and depend on permissions", () => {
  const keys = (permissions: readonly string[]) =>
    labNavigation("pesados", permissions).map((item) => item.key);
  assert.deepEqual(keys(teacher.permissions), [
    "home",
    "academic",
    "reservations",
    "attendance",
    "usage",
    "loans",
    "incidents",
    "maintenance",
    "inventory",
    "spaces",
    "reports",
    "people",
  ]);
  const forStudent = keys(student.permissions);
  assert.ok(forStudent.includes("attendance"));
  assert.ok(!forStudent.includes("people"));
  assert.ok(!forStudent.includes("maintenance"));

  assert.deepEqual(
    createActions("pesados", student.permissions).map((a) => a.key),
    ["new-reservation", "new-incident"],
  );
  assert.deepEqual(
    createActions("pesados", teacher.permissions).map((a) => a.key),
    ["new-practice", "new-reservation", "new-incident", "new-person"],
  );
});
