import "server-only";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { readDatabasePoolMax, readDatabaseUrl } from "@/config/database-env";
import * as schema from "./schema";
const globalDatabase = globalThis as unknown as { laboraPool?: Pool };
export function getDatabase() {
  const pool = (globalDatabase.laboraPool ??= new Pool({
    connectionString: readDatabaseUrl(process.env),
    max: readDatabasePoolMax(process.env),
    // Release idle connections quickly: serverless instances may freeze.
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 5000,
  }));
  return drizzle(pool, { schema });
}
