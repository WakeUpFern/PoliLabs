import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import test from "node:test";
import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../../src/infrastructure/database/schema";
import { AuthorizationService } from "../../src/modules/identity/application/authorization-service";
import { BootstrapInstallation } from "../../src/modules/identity/application/bootstrap-installation";
import { MemberAdministration } from "../../src/modules/identity/application/member-administration";
import { INITIAL_PERMISSION_LIST } from "../../src/modules/identity/domain/access-catalog";
import { AuthorizationDeniedError } from "../../src/modules/identity/domain/access-errors";
import { MemberAdministrationError } from "../../src/modules/identity/domain/member-administration";
import { DrizzleAuthorizationReader } from "../../src/modules/identity/infrastructure/access-repository";
import {
  laboratories,
  laboratoryMemberships,
  membershipRoles,
} from "../../src/modules/identity/infrastructure/access-schema";
import {
  accounts,
  sessions,
  users,
} from "../../src/modules/identity/infrastructure/auth-schema";
import {
  BetterAuthLocalIdentityProvisioner,
  createBootstrapAuth,
} from "../../src/modules/identity/infrastructure/bootstrap-auth";
import { DrizzleBootstrapCoordinator } from "../../src/modules/identity/infrastructure/bootstrap-coordinator";
import {
  DrizzleMemberAdministrationStore,
  readPasswordChangePending,
  temporaryPasswords,
} from "../../src/modules/identity/infrastructure/member-administration-store";
import { ensureRoleCatalog } from "../../src/modules/identity/infrastructure/role-catalog";
import { createRuntimeAuth } from "../../src/modules/identity/infrastructure/runtime-auth";
import { prepareIntegrationDatabase } from "./database";

function cookieHeader(headers: Headers) {
  return headers
    .getSetCookie()
    .map((value) => value.split(";", 1)[0])
    .join("; ");
}

const code = (expected: string) => (error: unknown) =>
  error instanceof MemberAdministrationError && error.code === expected;

test("member administration with the real role catalog and credentials", async (t) => {
  const pool = new Pool({
    connectionString: await prepareIntegrationDatabase(),
    max: 4,
  });
  const database = drizzle(pool, { schema });
  const suffix = randomUUID();
  const labIds: string[] = [];
  const createdUserIds: string[] = [];

  try {
    const roleIds = await ensureRoleCatalog(database);
    const auth = createBootstrapAuth(database);
    const runtime = createRuntimeAuth(database, "http://localhost:3000");
    const service = new MemberAdministration(
      new DrizzleMemberAdministrationStore(database),
      temporaryPasswords,
    );
    const authorization = new AuthorizationService(
      new DrizzleAuthorizationReader(database),
    );

    const [lab, otherLab] = await database
      .insert(laboratories)
      .values([
        { slug: `members-${suffix}`, name: "Members fixture" },
        { slug: `members-other-${suffix}`, name: "Other fixture" },
      ])
      .returning({ id: laboratories.id });
    labIds.push(lab.id, otherLab.id);

    const person = async (key: string, roleKey: string, labId = lab.id) => {
      const password = randomBytes(18).toString("base64url");
      const email = `${key}-${suffix}@invalid.test`;
      const { user } = await auth.api.signUpEmail({
        body: { name: key, email, password },
      });
      createdUserIds.push(user.id);
      const [membership] = await database
        .insert(laboratoryMemberships)
        .values({ userId: user.id, laboratoryId: labId })
        .returning({ id: laboratoryMemberships.id });
      await database
        .insert(membershipRoles)
        .values({ membershipId: membership.id, roleId: roleIds[roleKey] });
      return { userId: user.id, membershipId: membership.id, email, password };
    };
    const responsible = await person("responsible", "laboratory_responsible");
    const teacher = await person("teacher", "laboratory_teacher");
    const asTeacher = { actorUserId: teacher.userId, laboratoryId: lab.id };

    let studentMembership = "";
    let temporary = "";
    let studentId = "";

    await t.test(
      "a teacher creates a student who must change the password",
      async () => {
        const created = await service.create({
          ...asTeacher,
          name: "  Alumna   Nueva ",
          email: `Student-${suffix}@INVALID.test`,
          roleKey: "laboratory_student",
        });
        assert.ok(created.temporaryPassword);
        temporary = created.temporaryPassword;
        studentMembership = created.membershipId;
        const [row] = await database
          .select({ id: users.id, name: users.name, email: users.email })
          .from(users)
          .where(eq(users.email, `student-${suffix}@invalid.test`));
        studentId = row.id;
        createdUserIds.push(studentId);
        assert.equal(row.name, "Alumna Nueva");
        const [credential] = await database
          .select({ password: accounts.password })
          .from(accounts)
          .where(eq(accounts.userId, studentId));
        assert.notEqual(credential.password, temporary);
        assert.equal(
          await readPasswordChangePending(database, studentId),
          true,
        );

        // The temporary password works with Better Auth's own sign-in.
        const signedIn = await runtime.api.signInEmail({
          body: { email: row.email, password: temporary },
          returnHeaders: true,
        });
        const newPassword = randomBytes(18).toString("base64url");
        await runtime.api.changePassword({
          body: {
            currentPassword: temporary,
            newPassword,
            revokeOtherSessions: true,
          },
          headers: new Headers({ cookie: cookieHeader(signedIn.headers) }),
        });
        assert.equal(
          await readPasswordChangePending(database, studentId),
          false,
        );

        const grant = await authorization.authorize({
          actorUserId: studentId,
          laboratoryId: lab.id,
          requiredPermission: "attendance.checkin",
        });
        assert.deepEqual(grant.roleKeys, ["laboratory_student"]);
      },
    );

    await t.test(
      "duplicates and roles above the teacher are refused",
      async () => {
        await assert.rejects(
          service.create({
            ...asTeacher,
            name: "Repetida",
            email: `student-${suffix}@invalid.test`,
            roleKey: "laboratory_student",
          }),
          code("exists"),
        );
        await assert.rejects(
          service.create({
            ...asTeacher,
            name: "Jefa",
            email: `boss-${suffix}@invalid.test`,
            roleKey: "laboratory_responsible",
          }),
          code("role"),
        );
        await assert.rejects(
          service.resetPassword({
            ...asTeacher,
            membershipId: responsible.membershipId,
          }),
          code("protected"),
        );
        await assert.rejects(
          service.setActive({
            ...asTeacher,
            membershipId: teacher.membershipId,
            active: false,
          }),
          code("self"),
        );
      },
    );

    await t.test(
      "a reset issues a new temporary password and signs the person out",
      async () => {
        const session = await runtime.api
          .signInEmail({
            body: {
              email: `student-${suffix}@invalid.test`,
              password: temporary,
            },
          })
          .catch(() => null);
        assert.equal(
          session,
          null,
          "the replaced temporary password no longer works",
        );

        const { temporaryPassword } = await service.resetPassword({
          ...asTeacher,
          membershipId: studentMembership,
        });
        assert.equal(
          await readPasswordChangePending(database, studentId),
          true,
        );
        assert.equal(
          (
            await database
              .select()
              .from(sessions)
              .where(eq(sessions.userId, studentId))
          ).length,
          0,
        );
        const again = await runtime.api.signInEmail({
          body: {
            email: `student-${suffix}@invalid.test`,
            password: temporaryPassword,
          },
        });
        assert.equal(again.user.id, studentId);
      },
    );

    await t.test(
      "role changes and deactivation take effect on authorization",
      async () => {
        await service.changeRole({
          ...asTeacher,
          membershipId: studentMembership,
          roleKey: "laboratory_teacher",
        });
        const promoted = await authorization.authorize({
          actorUserId: studentId,
          laboratoryId: lab.id,
          requiredPermission: "academic.manage",
        });
        assert.deepEqual(promoted.roleKeys, ["laboratory_teacher"]);

        await service.setActive({
          ...asTeacher,
          membershipId: studentMembership,
          active: false,
        });
        await assert.rejects(
          authorization.authorize({
            actorUserId: studentId,
            laboratoryId: lab.id,
            requiredPermission: "laboratory.read",
          }),
          AuthorizationDeniedError,
        );
        const overview = await service.overview(asTeacher);
        const listed = overview.members.find(
          (member) => member.membershipId === studentMembership,
        );
        assert.equal(listed?.isActive, false);
        assert.deepEqual(overview.roles.map((role) => role.key).sort(), [
          "laboratory_student",
          "laboratory_teacher",
        ]);
      },
    );

    await t.test(
      "accounts shared with another laboratory are not reset here",
      async () => {
        const shared = await person(
          "shared",
          "laboratory_student",
          otherLab.id,
        );
        const { membershipId } = await service
          .create({
            ...asTeacher,
            name: "Compartida",
            email: shared.email,
            roleKey: "laboratory_student",
          })
          .then((result) => {
            assert.equal(result.temporaryPassword, null);
            return result;
          });
        await assert.rejects(
          service.resetPassword({ ...asTeacher, membershipId }),
          code("shared-account"),
        );
      },
    );

    await t.test("students cannot administer members", async () => {
      const student = await person("plain-student", "laboratory_student");
      await assert.rejects(
        service.overview({ actorUserId: student.userId, laboratoryId: lab.id }),
        AuthorizationDeniedError,
      );
    });
  } finally {
    const memberships = await database
      .select({ id: laboratoryMemberships.id })
      .from(laboratoryMemberships)
      .where(inArray(laboratoryMemberships.laboratoryId, labIds));
    if (memberships.length)
      await database.delete(membershipRoles).where(
        inArray(
          membershipRoles.membershipId,
          memberships.map((m) => m.id),
        ),
      );
    await database
      .delete(laboratoryMemberships)
      .where(inArray(laboratoryMemberships.laboratoryId, labIds));
    if (labIds.length)
      await database
        .delete(laboratories)
        .where(inArray(laboratories.id, labIds));
    if (createdUserIds.length)
      await database.delete(users).where(inArray(users.id, createdUserIds));
    await pool.end();
  }
});

test("bootstrap succeeds on a fresh installation whose migrations seeded the catalog", async () => {
  const pool = new Pool({
    connectionString: await prepareIntegrationDatabase(),
    max: 4,
  });
  const database = drizzle(pool, { schema });
  // Bootstrap only runs on an installation without people or laboratories;
  // every suite removes its own, so the shared _test database is empty here.
  const leftovers = await database
    .select({ id: users.id })
    .from(users)
    .limit(1);
  if (leftovers.length) {
    await pool.end();
    assert.fail("The _test database must have no users for this test.");
  }
  try {
    await ensureRoleCatalog(database);
    const suffix = randomUUID();
    const result = await new BootstrapInstallation(
      new BetterAuthLocalIdentityProvisioner(createBootstrapAuth(database)),
      new DrizzleBootstrapCoordinator(database),
    ).execute({
      userName: "Bootstrap after migrations",
      userEmail: `fresh-${suffix}@invalid.test`,
      password: randomBytes(24).toString("base64url"),
      laboratoryName: "Laboratorio de Pesados fixture",
      laboratorySlug: `fresh-${suffix}`,
    });
    const grant = await new AuthorizationService(
      new DrizzleAuthorizationReader(database),
    ).authorize({
      actorUserId: result.userId,
      laboratoryId: result.laboratoryId,
      requiredPermission: "laboratory.membership.manage",
    });
    assert.deepEqual(grant.roleKeys, ["laboratory_responsible"]);
    assert.equal(grant.permissionKeys.length, INITIAL_PERMISSION_LIST.length);

    await database
      .delete(membershipRoles)
      .where(eq(membershipRoles.membershipId, result.membershipId));
    await database
      .delete(laboratoryMemberships)
      .where(eq(laboratoryMemberships.id, result.membershipId));
    await database
      .delete(laboratories)
      .where(eq(laboratories.id, result.laboratoryId));
    await database.delete(users).where(eq(users.id, result.userId));
  } finally {
    await pool.end();
  }
});
