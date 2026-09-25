import assert from "node:assert/strict";
import test from "node:test";
import { Pool } from "pg";
import { prepareIntegrationDatabase } from "./database";

const expectedTables = ["accounts", "sessions", "users", "verifications"];

test("the approved Better Auth schema works against PostgreSQL", async () => {
  const databaseUrl = await prepareIntegrationDatabase();
  process.env.DATABASE_URL = databaseUrl;
  const inspectionPool = new Pool({
    connectionString: databaseUrl,
    max: 1,
  });

  const { auth, closeAuthSchemaPool } =
    await import("../../src/modules/identity/infrastructure/auth-schema.config");

  try {
    const tables = await inspectionPool.query<{ table_name: string }>(
      `select table_name
         from information_schema.tables
        where table_schema = 'public'
          and table_name = any($1::text[])
        order by table_name`,
      [expectedTables],
    );

    assert.deepEqual(
      tables.rows.map(({ table_name }) => table_name),
      expectedTables,
    );

    const identifiers = await inspectionPool.query<{
      table_name: string;
      column_name: string;
      data_type: string;
      column_default: string | null;
    }>(
      `select table_name, column_name, data_type, column_default
         from information_schema.columns
        where table_schema = 'public'
          and table_name = any($1::text[])
          and (column_name = 'id' or column_name = 'user_id')
        order by table_name, column_name`,
      [expectedTables],
    );

    assert.equal(identifiers.rowCount, 6);
    for (const identifier of identifiers.rows) {
      assert.equal(identifier.data_type, "uuid");
      if (identifier.column_name === "id") {
        assert.match(identifier.column_default ?? "", /gen_random_uuid\(\)/);
      }
    }

    const foreignKeys = await inspectionPool.query<{ constraint_name: string }>(
      `select constraint_name
         from information_schema.table_constraints
        where table_schema = 'public'
          and table_name = any($1::text[])
          and constraint_type = 'FOREIGN KEY'
        order by constraint_name`,
      [["accounts", "sessions"]],
    );

    assert.deepEqual(
      foreignKeys.rows.map(({ constraint_name }) => constraint_name),
      ["accounts_user_id_users_id_fk", "sessions_user_id_users_id_fk"],
    );

    const migrations = await inspectionPool.query<{ migration_count: number }>(
      `select count(*)::integer as migration_count
         from drizzle.__drizzle_migrations`,
    );

    assert.equal(migrations.rows[0]?.migration_count, 2);

    const response = await auth.handler(
      new Request("http://localhost:3000/api/auth/sign-in/email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "nonexistent-user@invalid.test",
          password: "not-a-real-password-value",
        }),
      }),
    );

    assert.equal(response.status, 401);
    const body = (await response.json()) as { code?: string };
    assert.equal(body.code, "INVALID_EMAIL_OR_PASSWORD");

    const rowCounts = await inspectionPool.query<{
      table_name: string;
      row_count: string;
    }>(`select 'accounts' as table_name, count(*)::text as row_count from accounts
        union all
       select 'sessions', count(*)::text from sessions
        union all
       select 'users', count(*)::text from users
        union all
       select 'verifications', count(*)::text from verifications
       order by table_name`);

    assert.deepEqual(
      rowCounts.rows,
      expectedTables.map((table_name) => ({ table_name, row_count: "0" })),
    );
  } finally {
    await Promise.all([inspectionPool.end(), closeAuthSchemaPool()]);
  }
});
