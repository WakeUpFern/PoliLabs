import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  check,
  index,
  uniqueIndex,
  foreignKey,
} from "drizzle-orm/pg-core";
import { users } from "@/modules/identity/infrastructure/auth-schema";
import { laboratories } from "@/modules/identity/infrastructure/access-schema";
import {
  spaces,
  resources,
} from "@/modules/spatial/infrastructure/spatial-schema";
import { maintenanceLogs } from "@/modules/maintenance/infrastructure/maintenance-schema";
import { inventoryItems } from "@/modules/inventory/infrastructure/inventory-schema";
import type { DocumentMediaType, DocumentSource } from "../domain/documents";
// Metadata only: binaries live in object storage under storage_key.
export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey(),
    laboratoryId: uuid("laboratory_id")
      .notNull()
      .references(() => laboratories.id, { onDelete: "restrict" }),
    storageKey: text("storage_key").notNull(),
    title: text("title"),
    // Free text that travels with evidence and photos ("le falta una llave").
    note: text("note"),
    originalName: text("original_name").notNull(),
    mediaType: text("media_type").$type<DocumentMediaType>().notNull(),
    byteSize: integer("byte_size").notNull(),
    sha256: text("sha256").notNull(),
    uploadedBy: uuid("uploaded_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    source: text("source").$type<DocumentSource>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    // Exactly one association per document.
    spaceId: uuid("space_id"),
    resourceId: uuid("resource_id"),
    maintenanceLogId: uuid("maintenance_log_id"),
    inventoryItemId: uuid("inventory_item_id"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    archivedBy: uuid("archived_by").references(() => users.id, {
      onDelete: "restrict",
    }),
    archiveReason: text("archive_reason"),
  },
  (t) => [
    uniqueIndex("documents_storage_key_idx").on(t.storageKey),
    index("documents_resource_time_idx").on(t.resourceId, t.createdAt),
    index("documents_maintenance_log_idx").on(t.maintenanceLogId),
    index("documents_inventory_item_time_idx").on(
      t.inventoryItemId,
      t.createdAt,
    ),
    index("documents_laboratory_time_idx").on(t.laboratoryId, t.createdAt),
    foreignKey({
      name: "documents_space_laboratory_fk",
      columns: [t.spaceId, t.laboratoryId],
      foreignColumns: [spaces.id, spaces.laboratoryId],
    }).onDelete("restrict"),
    foreignKey({
      name: "documents_resource_space_fk",
      columns: [t.resourceId, t.spaceId],
      foreignColumns: [resources.id, resources.spaceId],
    }).onDelete("restrict"),
    foreignKey({
      name: "documents_maintenance_log_laboratory_fk",
      columns: [t.maintenanceLogId, t.laboratoryId],
      foreignColumns: [maintenanceLogs.id, maintenanceLogs.laboratoryId],
    }).onDelete("restrict"),
    foreignKey({
      name: "documents_inventory_item_laboratory_fk",
      columns: [t.inventoryItemId, t.laboratoryId],
      foreignColumns: [inventoryItems.id, inventoryItems.laboratoryId],
    }).onDelete("restrict"),
    check(
      "documents_association_check",
      sql`num_nonnulls(${t.resourceId}, ${t.maintenanceLogId}, ${t.inventoryItemId}) = 1 and (${t.resourceId} is null) = (${t.spaceId} is null)`,
    ),
    check(
      "documents_storage_key_check",
      sql`${t.storageKey} ~ '^documents/[0-9a-f-]{36}/[0-9a-f-]{36}$' and split_part(${t.storageKey}, '/', 2) = ${t.laboratoryId}::text`,
    ),
    check(
      "documents_media_type_check",
      sql`${t.mediaType} in ('application/pdf','image/png','image/jpeg','image/webp')`,
    ),
    check(
      "documents_byte_size_check",
      sql`${t.byteSize} between 1 and 10485760`,
    ),
    check("documents_sha256_check", sql`${t.sha256} ~ '^[0-9a-f]{64}$'`),
    check(
      "documents_name_check",
      sql`length(btrim(${t.originalName})) between 1 and 255 and (${t.title} is null or length(btrim(${t.title})) between 1 and 200)`,
    ),
    check(
      "documents_note_check",
      sql`${t.note} is null or length(btrim(${t.note})) between 1 and 1000`,
    ),
    check(
      "documents_inventory_item_image_check",
      sql`${t.inventoryItemId} is null or ${t.mediaType} <> 'application/pdf'`,
    ),
    check(
      "documents_title_resource_check",
      sql`${t.title} is null or ${t.resourceId} is not null`,
    ),
    check(
      "documents_source_check",
      sql`${t.source} in ('WEB','API','AGENT','SYSTEM')`,
    ),
    check(
      "documents_archive_check",
      sql`num_nonnulls(${t.archivedAt}, ${t.archivedBy}, ${t.archiveReason}) in (0, 3) and (${t.archiveReason} is null or length(btrim(${t.archiveReason})) between 1 and 1000) and (${t.archivedAt} is null or ${t.archivedAt} >= ${t.createdAt})`,
    ),
  ],
);
