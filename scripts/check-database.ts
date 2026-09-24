import { loadEnvConfig } from "@next/env";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { Pool } from "pg";
import { readDatabaseUrl } from "../src/config/database-env";
async function main() {
  loadEnvConfig(process.cwd());
  const pool = new Pool({
    connectionString: readDatabaseUrl(process.env),
    connectionTimeoutMillis: 5000,
  });
  try {
    await drizzle(pool).execute(sql`select 1`);
    console.log("PostgreSQL connection OK");
  } finally {
    await pool.end();
  }
}
main().catch(() => {
  console.error(
    "Database check failed. Verify PostgreSQL and DATABASE_URL; credentials are not logged.",
  );
  process.exitCode = 1;
});
