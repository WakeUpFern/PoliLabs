import { expect, test } from "@playwright/test";
import { seedLaboratory, type SeededLaboratory } from "./support/seed";

// A failed sign-in must always tell the person what happened and never fall
// back to a native form submission that puts the credentials in the URL.
// The sign-in rate limit stays enabled and maintenance.spec.ts also signs in
// through the form, so this runs once, on the phone layout where the problem
// was reported.
let lab: SeededLaboratory;

test.beforeAll(async () => {
  lab = await seedLaboratory({
    prefix: "e2e-login",
    users: [{ key: "member", name: "Integrante e2e", permissions: [] }],
    resources: [],
  });
});

test.afterAll(async () => {
  await lab?.cleanup();
});

test("a rejected sign-in shows a visible error and keeps the password out of the URL", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "One sign-in attempt per run");
  await page.goto("/login");
  await page.getByLabel("Correo").fill(lab.users.member.email);
  await page.getByLabel("Contraseña").fill("not-the-e2e-password-value");
  await page.getByRole("button", { name: "Iniciar sesión" }).click();

  await expect(
    page.getByRole("alert").filter({ hasText: "Revisa tus credenciales" }),
  ).toBeVisible();
  expect(new URL(page.url()).search).toBe("");
  await expect(page.getByText("no terminó de cargar")).toBeHidden();
});
