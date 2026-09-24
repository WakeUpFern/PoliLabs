import { loadEnvConfig } from "@next/env";
import { defineConfig } from "drizzle-kit";
import { readDatabaseUrl } from "./src/config/database-env";
loadEnvConfig(process.cwd());
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/infrastructure/database/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: readDatabaseUrl(process.env) },
  strict: true,
});
