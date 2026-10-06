import { and, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type * as schema from "@/infrastructure/database/schema";
import { AuthorizationService } from "../application/authorization-service";
import { DrizzleAuthorizationReader } from "./access-repository";
import type { PermissionKey } from "../domain/access-catalog";
import {
  laboratories,
  laboratoryMemberships,
  membershipRoles,
  permissions,
  rolePermissions,
  roles,
} from "./access-schema";
import { users } from "./auth-schema";
export type OperationDatabase = NodePgDatabase<typeof schema>;
export type OperationTransaction = Parameters<
  Parameters<OperationDatabase["transaction"]>[0]
>[0];
type Transaction = OperationTransaction;
export async function authorizeLocked(
  tx: Transaction,
  context: { actorUserId: string; laboratoryId: string },
  permission: PermissionKey,
) {
  // Protect membership, actor, lab and concrete permission paths until commit.
  await tx
    .select({ id: laboratoryMemberships.id })
    .from(users)
    .innerJoin(
      laboratoryMemberships,
      and(
        eq(laboratoryMemberships.userId, users.id),
        eq(laboratoryMemberships.laboratoryId, context.laboratoryId),
      ),
    )
    .innerJoin(
      laboratories,
      eq(laboratories.id, laboratoryMemberships.laboratoryId),
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
        eq(permissions.key, permission),
      ),
    )
    .where(eq(users.id, context.actorUserId))
    .for("share");
  return new AuthorizationService(new DrizzleAuthorizationReader(tx)).authorize(
    { ...context, requiredPermission: permission },
  );
}
