import { and, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { AuthorizationReader } from "../application/authorization-service";
import type { LaboratoryReader } from "../application/get-laboratory";
import type { MembershipRoleAssigner } from "../application/assign-membership-role";
import type { ActiveUserReader } from "../application/get-current-user";
import type { LaboratorySlugReader } from "../application/get-laboratory-by-slug";
import type {
  AccessibleLaboratory,
  UserLaboratoriesReader,
} from "../application/get-user-laboratories";
import { INITIAL_PERMISSIONS } from "../domain/access-catalog";
import * as databaseSchema from "@/infrastructure/database/schema";
import { users } from "./auth-schema";
import {
  laboratories,
  laboratoryMemberships,
  membershipRoles,
  permissions,
  rolePermissions,
  roles,
} from "./access-schema";

export type IdentityDatabase = NodePgDatabase<typeof databaseSchema>;

export class DrizzleActiveUserReader implements ActiveUserReader {
  constructor(private readonly database: IdentityDatabase) {}

  async findActiveById(userId: string) {
    const [user] = await this.database
      .select({ id: users.id, name: users.name, email: users.email })
      .from(users)
      .where(and(eq(users.id, userId), eq(users.isActive, true)))
      .limit(1);

    return user ?? null;
  }
}

export class DrizzleUserLaboratoriesReader implements UserLaboratoriesReader {
  constructor(private readonly database: IdentityDatabase) {}

  async listActiveForUser(
    actorUserId: string,
  ): Promise<readonly AccessibleLaboratory[] | null> {
    const [activeUser] = await this.database
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, actorUserId), eq(users.isActive, true)))
      .limit(1);
    if (!activeUser) return null;

    const rows = await this.database
      .select({
        id: laboratories.id,
        slug: laboratories.slug,
        name: laboratories.name,
        roleKey: roles.key,
        roleName: roles.name,
      })
      .from(laboratoryMemberships)
      .innerJoin(
        laboratories,
        and(
          eq(laboratories.id, laboratoryMemberships.laboratoryId),
          eq(laboratories.isActive, true),
        ),
      )
      .leftJoin(
        membershipRoles,
        eq(membershipRoles.membershipId, laboratoryMemberships.id),
      )
      .leftJoin(roles, eq(roles.id, membershipRoles.roleId))
      .where(
        and(
          eq(laboratoryMemberships.userId, actorUserId),
          eq(laboratoryMemberships.isActive, true),
        ),
      );

    type MutableAccessibleLaboratory = Omit<
      AccessibleLaboratory,
      "roleKeys" | "roleNames"
    > & {
      roleKeys: string[];
      roleNames: string[];
    };
    const result = new Map<string, MutableAccessibleLaboratory>();
    for (const row of rows) {
      const laboratory = result.get(row.id) ?? {
        id: row.id,
        slug: row.slug,
        name: row.name,
        roleKeys: [],
        roleNames: [],
      };
      if (row.roleKey && !laboratory.roleKeys.includes(row.roleKey)) {
        laboratory.roleKeys.push(row.roleKey);
      }
      if (row.roleName && !laboratory.roleNames.includes(row.roleName)) {
        laboratory.roleNames.push(row.roleName);
      }
      result.set(row.id, laboratory);
    }

    return [...result.values()];
  }
}

export class DrizzleAuthorizationReader implements AuthorizationReader {
  constructor(private readonly database: IdentityDatabase) {}

  async readAuthorizationSnapshot(input: {
    actorUserId: string;
    laboratoryId: string;
  }) {
    const rows = await this.database
      .select({
        actorUserId: users.id,
        laboratoryId: laboratories.id,
        membershipId: laboratoryMemberships.id,
        userIsActive: users.isActive,
        laboratoryIsActive: laboratories.isActive,
        membershipIsActive: laboratoryMemberships.isActive,
        roleKey: roles.key,
        permissionKey: permissions.key,
      })
      .from(users)
      .innerJoin(
        laboratoryMemberships,
        and(
          eq(laboratoryMemberships.userId, users.id),
          eq(laboratoryMemberships.laboratoryId, input.laboratoryId),
        ),
      )
      .innerJoin(
        laboratories,
        eq(laboratories.id, laboratoryMemberships.laboratoryId),
      )
      .leftJoin(
        membershipRoles,
        eq(membershipRoles.membershipId, laboratoryMemberships.id),
      )
      .leftJoin(roles, eq(roles.id, membershipRoles.roleId))
      .leftJoin(rolePermissions, eq(rolePermissions.roleId, roles.id))
      .leftJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
      .where(eq(users.id, input.actorUserId));

    const first = rows[0];
    if (!first) return null;

    return {
      actorUserId: first.actorUserId,
      laboratoryId: first.laboratoryId,
      membershipId: first.membershipId,
      userIsActive: first.userIsActive,
      laboratoryIsActive: first.laboratoryIsActive,
      membershipIsActive: first.membershipIsActive,
      roleKeys: [...new Set(rows.flatMap(({ roleKey }) => roleKey ?? []))],
      permissionKeys: [
        ...new Set(rows.flatMap(({ permissionKey }) => permissionKey ?? [])),
      ],
    };
  }
}

export class DrizzleLaboratoryReader
  implements LaboratoryReader, LaboratorySlugReader
{
  constructor(private readonly database: IdentityDatabase) {}

  async findActiveById(laboratoryId: string) {
    const [laboratory] = await this.database
      .select({
        id: laboratories.id,
        slug: laboratories.slug,
        name: laboratories.name,
      })
      .from(laboratories)
      .where(
        and(eq(laboratories.id, laboratoryId), eq(laboratories.isActive, true)),
      )
      .limit(1);

    return laboratory ?? null;
  }

  async findActiveBySlug(slug: string) {
    const [laboratory] = await this.database
      .select({
        id: laboratories.id,
        slug: laboratories.slug,
        name: laboratories.name,
      })
      .from(laboratories)
      .where(and(eq(laboratories.slug, slug), eq(laboratories.isActive, true)))
      .limit(1);

    return laboratory ?? null;
  }
}

export class DrizzleMembershipRoleAssigner implements MembershipRoleAssigner {
  constructor(private readonly database: IdentityDatabase) {}

  async assignRole(input: {
    actorUserId: string;
    laboratoryId: string;
    membershipId: string;
    roleKey: string;
  }) {
    return this.database.transaction(async (transaction) => {
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
            eq(permissions.key, INITIAL_PERMISSIONS.laboratoryRoleAssign.key),
          ),
        )
        .where(and(eq(users.id, input.actorUserId), eq(users.isActive, true)))
        .limit(1)
        .for("update");

      if (!authorization) return "unauthorized" as const;

      const [target] = await transaction
        .select({
          membershipId: laboratoryMemberships.id,
          roleId: roles.id,
        })
        .from(laboratoryMemberships)
        .innerJoin(roles, eq(roles.key, input.roleKey))
        .where(
          and(
            eq(laboratoryMemberships.id, input.membershipId),
            eq(laboratoryMemberships.laboratoryId, input.laboratoryId),
          ),
        )
        .limit(1)
        .for("update");

      if (!target) return "invalid-relation" as const;

      const inserted = await transaction
        .insert(membershipRoles)
        .values(target)
        .onConflictDoNothing()
        .returning({ membershipId: membershipRoles.membershipId });

      return inserted.length > 0
        ? ("assigned" as const)
        : ("duplicate" as const);
    });
  }
}
