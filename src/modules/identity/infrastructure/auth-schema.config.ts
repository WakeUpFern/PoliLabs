import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { readDatabaseUrl } from "@/config/database-env";
import { authOptions } from "./auth-options";
import * as authSchema from "./auth-schema";

// The Better Auth CLI loads this configuration without a database connection.
// Runtime code uses auth.ts, which adds the PostgreSQL Drizzle adapter.
const pool = new Pool({
  connectionString: readDatabaseUrl(process.env),
  max: 1,
});

export function closeAuthSchemaPool() {
  return pool.end();
}

const database = drizzle(pool, { schema: authSchema });

export const auth = betterAuth({
  ...authOptions,
  baseURL: "http://localhost:3000",
  database: drizzleAdapter(database, {
    provider: "pg",
    schema: authSchema,
    usePlural: true,
  }),
});
