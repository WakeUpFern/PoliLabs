import { and, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { AuthorizationReader } from "../application/authorization-service";
import type { LaboratoryReader } from "../application/get-laboratory";
import type { MembershipRoleAssigner } from "../application/assign-membership-role";
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

export class DrizzleLaboratoryReader implements LaboratoryReader {
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
