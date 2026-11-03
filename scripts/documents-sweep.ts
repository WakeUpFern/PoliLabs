/** Report (default) or delete (--apply) stored objects without document metadata. */
import { loadEnvConfig } from "@next/env";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { readDatabaseUrl } from "../src/config/database-env";
import { readDocumentStorageConfig } from "../src/config/document-storage-env";
import * as schema from "../src/infrastructure/database/schema";
import { sweepOrphanObjects } from "../src/modules/documents/infrastructure/orphan-sweep";
import { createObjectStorage } from "../src/modules/documents/infrastructure/object-storage-factory";
async function main() {
  loadEnvConfig(process.cwd());
  const apply = process.argv.includes("--apply");
  const storage = createObjectStorage(readDocumentStorageConfig(process.env));
  const pool = new Pool({
    connectionString: readDatabaseUrl(process.env),
    connectionTimeoutMillis: 5000,
  });
  try {
    const orphans = await sweepOrphanObjects(
      drizzle(pool, { schema }),
      storage,
      {
        apply,
      },
    );
    for (const orphan of orphans) {
      console.log(`${apply ? "deleted" : "orphan"} ${orphan.key}`);
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
    "Document sweep failed. Verify PostgreSQL, DATABASE_URL and the DOCUMENT_STORAGE settings; credentials are not logged.",
  );
  process.exitCode = 1;
});
