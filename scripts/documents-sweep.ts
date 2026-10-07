/** Report (default) or delete (--apply) stored objects without document metadata. */
import { loadEnvConfig } from "@next/env";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { readDatabaseUrl } from "../src/config/database-env";
import { readDocumentStorageDir } from "../src/config/document-storage-env";
import * as schema from "../src/infrastructure/database/schema";
import { findOrphans } from "../src/modules/documents/application/object-storage";
import { LocalDiskObjectStorage } from "../src/modules/documents/infrastructure/local-object-storage";
async function main() {
  loadEnvConfig(process.cwd());
  const apply = process.argv.includes("--apply");
  const storage = new LocalDiskObjectStorage(
    readDocumentStorageDir(process.env),
  );
  const pool = new Pool({
    connectionString: readDatabaseUrl(process.env),
    connectionTimeoutMillis: 5000,
  });
  try {
    // Archived documents keep their objects: every row protects its key.
    const rows = await drizzle(pool, { schema })
      .select({ key: schema.documents.storageKey })
      .from(schema.documents);
    const orphans = await findOrphans(
      storage,
      new Set(rows.map((r) => r.key)),
      new Date(),
    );
    for (const orphan of orphans) {
      console.log(`${apply ? "deleted" : "orphan"} ${orphan.key}`);
      if (apply) await storage.delete(orphan.key);
    }
    console.log(
      `${orphans.length} orphan object(s) older than 24 h${apply ? " deleted" : "; run with --apply to delete"}.`,
    );
  } finally {
    await pool.end();
  }
}
main().catch(() => {
  console.error(
    "Document sweep failed. Verify PostgreSQL, DATABASE_URL and DOCUMENT_STORAGE_DIR; credentials are not logged.",
  );
  process.exitCode = 1;
});
