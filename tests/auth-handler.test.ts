import assert from "node:assert/strict";
import test from "node:test";

test("the public email sign-up endpoint is disabled", async () => {
  process.env.DATABASE_URL ??=
    "postgresql://labora:test-only@localhost:5433/labora_test";
  process.env.BETTER_AUTH_SECRET ??=
    "test-only-secret-that-is-longer-than-thirty-two-characters";

  const { auth } =
    await import("../src/modules/identity/infrastructure/auth-schema.config");

  const response = await auth.handler(
    new Request("http://localhost:3000/api/auth/sign-up/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Example User",
        email: "example.invalid@invalid.test",
        password: "not-a-real-password-value",
      }),
    }),
  );

  assert.equal(response.status, 400);
  const body = (await response.json()) as { code?: string };
  assert.equal(body.code, "EMAIL_PASSWORD_SIGN_UP_DISABLED");
});
