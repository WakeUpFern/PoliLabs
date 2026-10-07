import { loadEnvConfig } from "@next/env";
import { defineConfig, devices } from "@playwright/test";
import { resolveTestDatabaseUrl } from "./tests/integration/database";
import { E2E_DOCUMENT_STORAGE_DIR } from "./tests/e2e/support/constants";

loadEnvConfig(process.cwd());

// The app under test always runs against the guarded *_test database, on its
// own port and storage directory, never against development data.
const port = Number(process.env.E2E_PORT ?? 3200);
const baseURL = `http://localhost:${port}`;
const { testUrl } = resolveTestDatabaseUrl();

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/*.spec.ts",
  // One server and one database: specs isolate data per laboratory, but run
  // serially to keep failures deterministic.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  globalSetup: "./tests/e2e/support/global-setup.ts",
  globalTeardown: "./tests/e2e/support/global-teardown.ts",
  use: {
    baseURL,
    locale: "es-MX",
    timezoneId: "America/Mexico_City",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: `pnpm build && pnpm start --port ${port}`,
    url: `${baseURL}/login`,
    timeout: 240_000,
    reuseExistingServer: false,
    stdout: "ignore",
    stderr: "pipe",
    env: {
      DATABASE_URL: testUrl.toString(),
      BETTER_AUTH_URL: baseURL,
      DOCUMENT_STORAGE_DIR: E2E_DOCUMENT_STORAGE_DIR,
    },
  },
});
