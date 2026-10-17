import { test } from "node:test";
import assert from "node:assert/strict";
import {
  describeSignInFailure,
  signInErrorMessages,
} from "../src/app/login/sign-in-error";

test("explains each kind of sign-in failure instead of always blaming credentials", () => {
  assert.equal(
    describeSignInFailure({ status: 401, code: "INVALID_EMAIL_OR_PASSWORD" }),
    signInErrorMessages.credentials,
  );
  assert.equal(
    describeSignInFailure({ status: 403, code: "INVALID_ORIGIN" }),
    signInErrorMessages.origin,
  );
  assert.equal(
    describeSignInFailure({ status: 403 }),
    signInErrorMessages.origin,
  );
  assert.equal(
    describeSignInFailure({ status: 429 }),
    signInErrorMessages.rateLimited,
  );
  assert.equal(
    describeSignInFailure({ status: 500 }),
    signInErrorMessages.unavailable,
  );
  assert.equal(describeSignInFailure({}), signInErrorMessages.unavailable);
});
