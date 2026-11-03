import { eq, inArray } from "drizzle-orm";
import {
  INITIAL_PERMISSION_LIST,
  LABORATORY_ROLE_CATALOG,
} from "../domain/access-catalog";
import type { IdentityDatabase } from "./access-repository";
import { permissions, rolePermissions, roles } from "./access-schema";

/**
 * Makes sure the permission catalog and the laboratory roles exist, as
 * migration 0015 does. Idempotent; used by demo seeding and tests whose
 * cleanup removes catalog rows. Returns role ids by key.
 */
export async function ensureRoleCatalog(database: IdentityDatabase) {
  await database
    .insert(permissions)
    .values(INITIAL_PERMISSION_LIST)
    .onConflictDoNothing({ target: permissions.key });
  const ids: Record<string, string> = {};
  for (const definition of LABORATORY_ROLE_CATALOG) {
    await database
      .insert(roles)
      .values({
        key: definition.key,
        name: definition.name,
        description: definition.description,
      })
      .onConflictDoNothing({ target: roles.key });
    const [role] = await database
      .select({ id: roles.id })
      .from(roles)
      .where(eq(roles.key, definition.key));
    const granted = await database
      .select({ id: permissions.id })
      .from(permissions)
      .where(inArray(permissions.key, [...definition.permissions]));
    await database
      .insert(rolePermissions)
      .values(granted.map(({ id }) => ({ roleId: role.id, permissionId: id })))
      .onConflictDoNothing();
    ids[definition.key] = role.id;
  }
  return ids;
}
