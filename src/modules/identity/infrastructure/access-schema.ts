import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./auth-schema";

const timestamps = () => ({
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

export const laboratories = pgTable(
  "laboratories",
  {
    id: uuid("id")
      .default(sql`pg_catalog.gen_random_uuid()`)
      .primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    ...timestamps(),
  },
  (table) => [uniqueIndex("laboratories_slug_unique_idx").on(table.slug)],
);

export const laboratoryMemberships = pgTable(
  "laboratory_memberships",
  {
    id: uuid("id")
      .default(sql`pg_catalog.gen_random_uuid()`)
      .primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    laboratoryId: uuid("laboratory_id")
      .notNull()
      .references(() => laboratories.id, { onDelete: "restrict" }),
    isActive: boolean("is_active").default(true).notNull(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("laboratory_memberships_user_laboratory_unique_idx").on(
      table.userId,
      table.laboratoryId,
    ),
    index("laboratory_memberships_laboratory_idx").on(table.laboratoryId),
  ],
);

export const roles = pgTable(
  "roles",
  {
    id: uuid("id")
      .default(sql`pg_catalog.gen_random_uuid()`)
      .primaryKey(),
    key: text("key").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull(),
    ...timestamps(),
  },
  (table) => [uniqueIndex("roles_key_unique_idx").on(table.key)],
);

export const permissions = pgTable(
  "permissions",
  {
    id: uuid("id")
      .default(sql`pg_catalog.gen_random_uuid()`)
      .primaryKey(),
    key: text("key").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull(),
    ...timestamps(),
  },
  (table) => [uniqueIndex("permissions_key_unique_idx").on(table.key)],
);

export const membershipRoles = pgTable(
  "membership_roles",
  {
    membershipId: uuid("membership_id")
      .notNull()
      .references(() => laboratoryMemberships.id, { onDelete: "restrict" }),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({
      name: "membership_roles_pk",
      columns: [table.membershipId, table.roleId],
    }),
    index("membership_roles_role_idx").on(table.roleId),
  ],
);

export const rolePermissions = pgTable(
  "role_permissions",
  {
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "restrict" }),
    permissionId: uuid("permission_id")
      .notNull()
      .references(() => permissions.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({
      name: "role_permissions_pk",
      columns: [table.roleId, table.permissionId],
    }),
    index("role_permissions_permission_idx").on(table.permissionId),
  ],
);
