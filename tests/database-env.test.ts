import { test } from "node:test";
import assert from "node:assert/strict";
import { readDatabaseUrl } from "../src/config/database-env";
test("accepts PostgreSQL connection URLs", () => {
  for (const protocol of ["postgres", "postgresql"]) {
    const value = `${protocol}://local:example@localhost:5432/labora`;
    assert.equal(readDatabaseUrl({ DATABASE_URL: value }), value);
  }
});
test("rejects missing, malformed, wrong-protocol and database-less URLs without exposing credentials", () => {
  for (const value of [
    undefined,
    "",
    "not-a-url",
    "https://host/database",
    "postgres://host",
    "postgres://user:private-value@/",
  ]) {
    assert.throws(
      () => readDatabaseUrl({ DATABASE_URL: value }),
      (error: unknown) =>
        error instanceof Error &&
        error.message.includes("DATABASE_URL") &&
        !error.message.includes("private-value"),
    );
  }
});
