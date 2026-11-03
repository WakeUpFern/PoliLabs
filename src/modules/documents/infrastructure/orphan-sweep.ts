import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type * as schema from "@/infrastructure/database/schema";
import {
  findOrphans,
  type ObjectStorage,
  type StoredObject,
} from "../application/object-storage";
import { documents } from "./document-schema";

/**
 * Stored objects without document metadata, older than the grace period.
 * With `apply` they are deleted. Archived documents keep their objects:
 * every row protects its key.
 */
export async function sweepOrphanObjects(
  db: NodePgDatabase<typeof schema>,
  storage: ObjectStorage,
  { apply, now = new Date() }: { apply: boolean; now?: Date },
): Promise<StoredObject[]> {
  const rows = await db.select({ key: documents.storageKey }).from(documents);
  const orphans = await findOrphans(
    storage,
    new Set(rows.map((row) => row.key)),
    now,
  );
  if (apply) for (const orphan of orphans) await storage.delete(orphan.key);
  return orphans;
}
