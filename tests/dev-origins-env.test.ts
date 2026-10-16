import { test } from "node:test";
import assert from "node:assert/strict";
import { readDevOriginHosts } from "../src/config/dev-origins-env";

test("derives dev origin hostnames from the Better Auth trusted origins", () => {
  assert.deepEqual(readDevOriginHosts({}), []);
  assert.deepEqual(
    readDevOriginHosts({
      BETTER_AUTH_TRUSTED_ORIGINS:
        " http://192.168.1.20:3000 ,http://192.168.1.20:3001,*.example.test,,http://Laptop.local:3000",
    }),
    ["192.168.1.20", "laptop.local"],
  );
});
