import { isId } from "@/shared/validation";
import { postgresError } from "@/infrastructure/database/postgres-error";
import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
import { randomBytes } from "node:crypto";
import type { PermissionKey } from "../domain/access-catalog";
import type { AuthorizationGrant } from "../application/authorization-service";
import type {
  MemberAdministrationStore,
  MemberContext,
  MemberRecord,
  MemberTransaction,
  RoleRecord,
  TemporaryPasswords,
} from "../application/member-administration";
import {
  formatTemporaryPassword,
  MemberAdministrationError,
  passwordChangePending,
  TEMPORARY_PASSWORD_BYTES,
} from "../domain/member-administration";
import {
  authorizeLocked,
  type OperationDatabase,
  type OperationTransaction,
} from "./authorize-locked";
import {
  laboratoryMemberships,
  membershipRoles,
  permissions,
  rolePermissions,
  roles,
} from "./access-schema";
import { accounts, sessions, users } from "./auth-schema";

export const temporaryPasswords: TemporaryPasswords = {
  generate: () =>
    formatTemporaryPassword(randomBytes(TEMPORARY_PASSWORD_BYTES)),
  // Same scrypt format Better Auth verifies at sign-in.
  hash: (password) => hashPassword(password),
};

class DrizzleMemberTransaction implements MemberTransaction {
  constructor(private readonly tx: OperationTransaction) {}

  private async records(laboratoryId: string, membershipId?: string) {
    const rows = await this.tx
      .select({
        membershipId: laboratoryMemberships.id,
        userId: users.id,
        name: users.name,
        email: users.email,
        isActive: laboratoryMemberships.isActive,
        userIsActive: users.isActive,
        issuedAt: users.temporaryPasswordIssuedAt,
        credentialUpdatedAt: accounts.updatedAt,
        otherActiveLaboratories: sql<number>`(
          select count(*)::int from ${laboratoryMemberships} other
          where other.user_id = ${users.id}
            and other.laboratory_id <> ${laboratoryId}
            and other.is_active
        )`,
      })
      .from(laboratoryMemberships)
      .innerJoin(users, eq(users.id, laboratoryMemberships.userId))
      .leftJoin(
        accounts,
        and(
          eq(accounts.userId, users.id),
          eq(accounts.providerId, "credential"),
        ),
      )
      .where(
        and(
          eq(laboratoryMemberships.laboratoryId, laboratoryId),
          membershipId ? eq(laboratoryMemberships.id, membershipId) : undefined,
        ),
      )
      .orderBy(asc(users.name), asc(users.email));
    if (rows.length === 0) return [];

    const grants = await this.tx
      .select({
        membershipId: membershipRoles.membershipId,
        roleKey: roles.key,
        roleName: roles.name,
        permissionKey: permissions.key,
      })
      .from(membershipRoles)
      .innerJoin(roles, eq(roles.id, membershipRoles.roleId))
      .leftJoin(rolePermissions, eq(rolePermissions.roleId, roles.id))
      .leftJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
      .where(
        inArray(
          membershipRoles.membershipId,
          rows.map((row) => row.membershipId),
        ),
      );

    return rows.map((row): MemberRecord => {
      const own = grants.filter((g) => g.membershipId === row.membershipId);
      const roleKeys = [...new Set(own.map((g) => g.roleKey))];
      return {
        membershipId: row.membershipId,
        userId: row.userId,
        name: row.name,
        email: row.email,
        isActive: row.isActive,
        userIsActive: row.userIsActive,
        roleKeys,
        roleNames: roleKeys.map(
          (key) => own.find((g) => g.roleKey === key)?.roleName ?? key,
        ),
        permissionKeys: [
          ...new Set(
            own.flatMap((g) => (g.permissionKey ? [g.permissionKey] : [])),
          ),
        ],
        passwordChangePending: passwordChangePending({
          temporaryPasswordIssuedAt: row.issuedAt,
          credentialUpdatedAt: row.credentialUpdatedAt,
        }),
        otherActiveLaboratories: row.otherActiveLaboratories,
      };
    });
  }

  members(laboratoryId: string) {
    return this.records(laboratoryId);
  }

  async member(laboratoryId: string, membershipId: string) {
    if (!isId(membershipId)) return null;
    // Serialize concurrent changes to the same membership.
    await this.tx
      .select({ id: laboratoryMemberships.id })
      .from(laboratoryMemberships)
      .where(
        and(
          eq(laboratoryMemberships.id, membershipId),
          eq(laboratoryMemberships.laboratoryId, laboratoryId),
        ),
      )
      .for("update");
    const [record] = await this.records(laboratoryId, membershipId);
    return record ?? null;
  }

  async roles(): Promise<RoleRecord[]> {
    const rows = await this.tx
      .select({
        id: roles.id,
        key: roles.key,
        name: roles.name,
        description: roles.description,
        permissionKey: permissions.key,
      })
      .from(roles)
      .leftJoin(rolePermissions, eq(rolePermissions.roleId, roles.id))
      .leftJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
      .orderBy(asc(roles.name));
    const byId = new Map<string, RoleRecord & { permissionKeys: string[] }>();
    for (const row of rows) {
      const role = byId.get(row.id) ?? {
        id: row.id,
        key: row.key,
        name: row.name,
        description: row.description,
        permissionKeys: [],
      };
      if (row.permissionKey) role.permissionKeys.push(row.permissionKey);
      byId.set(row.id, role);
    }
    return [...byId.values()];
  }

  async findUserIdByEmail(email: string) {
    const [row] = await this.tx
      .select({ id: users.id })
      .from(users)
      .where(sql`lower(${users.email}) = ${email.toLowerCase()}`)
      .limit(1);
    return row?.id ?? null;
  }

  async isMember(laboratoryId: string, userId: string) {
    const [row] = await this.tx
      .select({ id: laboratoryMemberships.id })
      .from(laboratoryMemberships)
      .where(
        and(
          eq(laboratoryMemberships.laboratoryId, laboratoryId),
          eq(laboratoryMemberships.userId, userId),
        ),
      )
      .limit(1);
    return Boolean(row);
  }

  async createLocalUser(input: {
    name: string;
    email: string;
    passwordHash: string;
  }) {
    const issuedAt = new Date();
    try {
      const [user] = await this.tx
        .insert(users)
        .values({
          name: input.name,
          email: input.email,
          temporaryPasswordIssuedAt: issuedAt,
        })
        .returning({ id: users.id });
      // Mirrors Better Auth's credential account: accountId is the user id.
      await this.tx.insert(accounts).values({
        userId: user.id,
        accountId: user.id,
        providerId: "credential",
        password: input.passwordHash,
        createdAt: issuedAt,
        updatedAt: issuedAt,
      });
      return user.id;
    } catch (error) {
      if (postgresError(error).code === "23505")
        throw new MemberAdministrationError("exists");
      throw error;
    }
  }

  async addMembership(input: {
    laboratoryId: string;
    userId: string;
    roleId: string;
  }) {
    try {
      const [membership] = await this.tx
        .insert(laboratoryMemberships)
        .values({ laboratoryId: input.laboratoryId, userId: input.userId })
        .returning({ id: laboratoryMemberships.id });
      await this.tx
        .insert(membershipRoles)
        .values({ membershipId: membership.id, roleId: input.roleId });
      return membership.id;
    } catch (error) {
      if (postgresError(error).code === "23505")
        throw new MemberAdministrationError("exists");
      throw error;
    }
  }

  async replaceRoles(membershipId: string, roleId: string) {
    await this.tx
      .delete(membershipRoles)
      .where(
        and(
          eq(membershipRoles.membershipId, membershipId),
          ne(membershipRoles.roleId, roleId),
        ),
      );
    await this.tx
      .insert(membershipRoles)
      .values({ membershipId, roleId })
      .onConflictDoNothing();
  }

  async setMembershipActive(membershipId: string, active: boolean) {
    await this.tx
      .update(laboratoryMemberships)
      .set({ isActive: active })
      .where(eq(laboratoryMemberships.id, membershipId));
  }

  async setTemporaryPassword(userId: string, passwordHash: string) {
    const issuedAt = new Date();
    const updated = await this.tx
      .update(accounts)
      .set({ password: passwordHash, updatedAt: issuedAt })
      .where(
        and(eq(accounts.userId, userId), eq(accounts.providerId, "credential")),
      )
      .returning({ id: accounts.id });
    if (updated.length === 0)
      await this.tx.insert(accounts).values({
        userId,
        accountId: userId,
        providerId: "credential",
        password: passwordHash,
        createdAt: issuedAt,
        updatedAt: issuedAt,
      });
    await this.tx
      .update(users)
      .set({ temporaryPasswordIssuedAt: issuedAt })
      .where(eq(users.id, userId));
    // Whoever held the old password is signed out everywhere.
    await this.tx.delete(sessions).where(eq(sessions.userId, userId));
  }
}

export class DrizzleMemberAdministrationStore implements MemberAdministrationStore {
  constructor(private readonly database: OperationDatabase) {}

  run<T>(
    context: MemberContext,
    permission: PermissionKey,
    work: (tx: MemberTransaction, grant: AuthorizationGrant) => Promise<T>,
  ): Promise<T> {
    return this.database.transaction(async (tx) => {
      const grant = await authorizeLocked(tx, context, permission);
      return work(new DrizzleMemberTransaction(tx), grant);
    });
  }
}

/** Whether the signed-in user still has to replace a temporary password. */
export async function readPasswordChangePending(
  database: OperationDatabase,
  userId: string,
) {
  const [row] = await database
    .select({
      issuedAt: users.temporaryPasswordIssuedAt,
      credentialUpdatedAt: accounts.updatedAt,
    })
    .from(users)
    .leftJoin(
      accounts,
      and(eq(accounts.userId, users.id), eq(accounts.providerId, "credential")),
    )
    .where(eq(users.id, userId))
    .limit(1);
  return row
    ? passwordChangePending({
        temporaryPasswordIssuedAt: row.issuedAt,
        credentialUpdatedAt: row.credentialUpdatedAt,
      })
    : false;
}
