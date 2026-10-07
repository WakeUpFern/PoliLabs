import {
  expect,
  type Browser,
  type Page,
  type TestInfo,
} from "@playwright/test";
import type { SeededUser } from "./seed";
import { E2E_PASSWORD } from "./constants";

// Signs in through the real login form, as a person would.
export async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Correo").fill(email);
  await page.getByLabel("Contraseña").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(page).toHaveURL(/\/app(\/|$)/);
}

// Mobile layouts must not scroll sideways (RNF responsive web).
export async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

// Opens a fresh browser context for a seeded user with the project's device
// settings. The caller closes the returned context.
export async function openAs(
  browser: Browser,
  testInfo: TestInfo,
  user: SeededUser,
) {
  const context = await browser.newContext(testInfo.project.use);
  await context.addCookies(user.cookies);
  const page = await context.newPage();
  return { context, page };
}
