import { loadEnvConfig } from "@next/env";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { readDatabaseUrl } from "../../src/config/database-env";
import * as schema from "../../src/infrastructure/database/schema";

loadEnvConfig(process.cwd());

let preparedDatabaseUrl: Promise<string> | undefined;

function quoteIdentifier(identifier: string) {
  if (!/^[a-zA-Z0-9_]+$/.test(identifier))
    throw new Error(
      "Integration database name contains unsupported characters.",
    );
  return `"${identifier}"`;
}

async function prepare() {
  const configuredUrl = process.env.TEST_DATABASE_URL;
  const sourceUrl = new URL(readDatabaseUrl(process.env));
  const testUrl = configuredUrl
    ? new URL(readDatabaseUrl({ DATABASE_URL: configuredUrl }))
    : new URL(sourceUrl);

  if (!configuredUrl) {
    const sourceDatabase = sourceUrl.pathname.slice(1);
    testUrl.pathname = `/${sourceDatabase}_test`;
  }

  const databaseName = testUrl.pathname.slice(1);
  const sourceDatabaseName = sourceUrl.pathname.slice(1);
  if (databaseName === sourceDatabaseName || !databaseName.endsWith("_test")) {
    throw new Error(
      "Integration tests require a separate database whose name ends with _test.",
    );
  }

  const administrationUrl = new URL(sourceUrl);
  administrationUrl.pathname = "/postgres";
  const administrationPool = new Pool({
    connectionString: administrationUrl.toString(),
    max: 1,
  });

  try {
    const existing = await administrationPool.query(
      "select 1 from pg_database where datname = $1",
      [databaseName],
    );
    if (existing.rowCount === 0) {
      await administrationPool.query(
        `create database ${quoteIdentifier(databaseName)}`,
      );
    }
  } finally {
    await administrationPool.end();
  }

  const migrationPool = new Pool({
    connectionString: testUrl.toString(),
    max: 1,
  });
  try {
    await migrate(drizzle(migrationPool, { schema }), {
      migrationsFolder: "drizzle",
    });
  } finally {
    await migrationPool.end();
  }

  return testUrl.toString();
}

export function prepareIntegrationDatabase() {
  return (preparedDatabaseUrl ??= prepare());
}
