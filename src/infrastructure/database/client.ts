import "server-only";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { readDatabaseUrl } from "@/config/database-env";
const globalDatabase = globalThis as unknown as { laboraPool?: Pool };
export function getDatabase() {
  const pool = (globalDatabase.laboraPool ??= new Pool({
    connectionString: readDatabaseUrl(process.env),
    max: 5,
    connectionTimeoutMillis: 5000,
  }));
  return drizzle(pool);
}
