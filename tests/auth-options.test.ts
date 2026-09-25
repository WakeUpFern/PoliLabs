import assert from "node:assert/strict";
import test from "node:test";
import { authOptions } from "../src/modules/identity/infrastructure/auth-options";

test("local authentication is enabled while public sign-up remains disabled", () => {
  assert.equal(authOptions.emailAndPassword.enabled, true);
  assert.equal(authOptions.emailAndPassword.disableSignUp, true);
  assert.equal(authOptions.emailAndPassword.minPasswordLength, 15);
  assert.equal(authOptions.emailAndPassword.maxPasswordLength, 128);
});

test("database sessions expire after twelve hours without refresh", () => {
  assert.equal(authOptions.session.expiresIn, 60 * 60 * 12);
  assert.equal(authOptions.session.disableSessionRefresh, true);
});

test("PostgreSQL generates native UUID identifiers", () => {
  assert.equal(authOptions.advanced.database.generateId, "uuid");
});

test("the internal user status cannot be supplied by public auth input", () => {
  assert.equal(authOptions.user.additionalFields.isActive.input, false);
  assert.equal(authOptions.user.additionalFields.isActive.defaultValue, true);
  assert.equal(authOptions.user.deleteUser.enabled, false);
});
