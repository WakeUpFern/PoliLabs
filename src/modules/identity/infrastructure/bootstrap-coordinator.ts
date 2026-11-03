import { count, eq, inArray, sql } from "drizzle-orm";
import type {
  BootstrapCoordinator,
  BootstrapResult,
} from "../application/bootstrap-installation";
import { BootstrapAlreadyInitializedError } from "../domain/access-errors";
import type { IdentityDatabase } from "./access-repository";
import {
  laboratories,
  laboratoryMemberships,
  membershipRoles,
  permissions,
  rolePermissions,
  roles,
} from "./access-schema";
import { users } from "./auth-schema";

const BOOTSTRAP_ADVISORY_LOCK_ID = 1_280_592_495;

export class DrizzleBootstrapCoordinator implements BootstrapCoordinator {
  constructor(private readonly database: IdentityDatabase) {}

  async initialize(
    input: Parameters<BootstrapCoordinator["initialize"]>[0],
    createIdentity: () => Promise<{ userId: string }>,
  ): Promise<BootstrapResult> {
    return this.database.transaction(async (transaction) => {
      await transaction.execute(
        sql`select pg_advisory_xact_lock(${BOOTSTRAP_ADVISORY_LOCK_ID})`,
      );

      const existingCounts: number[] = [];
      // Migrations seed permissions and the role catalog, so only people and
      // laboratories tell whether the installation was already initialized.
      for (const table of [users, laboratories, laboratoryMemberships]) {
        const [result] = await transaction
          .select({ value: count() })
          .from(table);
        existingCounts.push(result?.value ?? 0);
      }

      if (existingCounts.some((value) => value > 0))
        throw new BootstrapAlreadyInitializedError();

      const identity = await createIdentity();

      const [laboratory] = await transaction
        .insert(laboratories)
        .values({
          name: input.laboratoryName,
          slug: input.laboratorySlug,
        })
        .returning({ id: laboratories.id });

      await transaction
        .insert(roles)
        .values(input.role)
        .onConflictDoNothing({ target: roles.key });
      const [role] = await transaction
        .select({ id: roles.id })
        .from(roles)
        .where(eq(roles.key, input.role.key));

      await transaction
        .insert(permissions)
        .values(input.permissions)
        .onConflictDoNothing({ target: permissions.key });
      const createdPermissions = await transaction
        .select({ id: permissions.id })
        .from(permissions)
        .where(
          inArray(
            permissions.key,
            input.permissions.map((permission) => permission.key),
          ),
        );

      const [membership] = await transaction
        .insert(laboratoryMemberships)
        .values({
          userId: identity.userId,
          laboratoryId: laboratory.id,
        })
        .returning({ id: laboratoryMemberships.id });

      await transaction.insert(membershipRoles).values({
        membershipId: membership.id,
        roleId: role.id,
      });

      await transaction
        .insert(rolePermissions)
        .values(
          createdPermissions.map(({ id }) => ({
            roleId: role.id,
            permissionId: id,
          })),
        )
        .onConflictDoNothing();

      return {
        userId: identity.userId,
        laboratoryId: laboratory.id,
        membershipId: membership.id,
        roleId: role.id,
      };
    });
  }
}
