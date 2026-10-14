import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { seedLaboratory, type SeededLaboratory } from "./support/seed";
import { expectNoHorizontalOverflow, openAs } from "./support/session";
import { E2E_EMAIL_OUTBOX_DIR } from "./support/constants";

// Notifications I (ADR 0019): a critical incident notifies reviewers in-app
// and by email; its resolution notifies the reporter the same way.
test.describe.configure({ mode: "serial" });

let lab: SeededLaboratory;

test.beforeAll(async () => {
  lab = await seedLaboratory({
    prefix: "e2e-notifications",
    users: [
      {
        key: "reviewer",
        name: "Revisora e2e",
        permissions: ["incident.read", "incident.review", "incident.resolve"],
      },
      {
        key: "student",
        name: "Alumno e2e",
        permissions: ["incident.create", "incident.read"],
      },
    ],
    resources: ["Torno e2e"],
  });
});

test.afterAll(async () => {
  await lab?.cleanup();
});

// Email is written after the response, so wait for the file to appear.
async function emailTo(address: string, subject: string) {
  let found = "";
  await expect
    .poll(async () => {
      const names = await readdir(E2E_EMAIL_OUTBOX_DIR).catch(() => []);
      for (const name of names.filter((n) => n.endsWith(".eml"))) {
        const content = await readFile(
          join(E2E_EMAIL_OUTBOX_DIR, name),
          "utf8",
        );
        const encoded = Buffer.from(subject, "utf8").toString("base64");
        if (content.includes(`To: ${address}\r\n`) && content.includes(encoded))
          found = content;
      }
      return found !== "";
    })
    .toBe(true);
  return found;
}

const notificationsLink = (page: Page) =>
  page.getByRole("link", { name: /^Notificaciones/ });

test("a critical incident reaches the reviewer in-app and by email", async ({
  browser,
}, testInfo) => {
  const student = await openAs(browser, testInfo, lab.users.student);
  await student.page.goto(`/app/labs/${lab.slug}/incidents/new`);
  await student.page
    .getByLabel("Objetivo afectado")
    .selectOption({ label: "Recurso: Torno e2e · Área de máquinas e2e" });
  await student.page.getByLabel("Descripción").fill("Fuga de aceite e2e");
  await student.page.getByLabel("Severidad").selectOption("high");
  await student.page
    .getByRole("button", { name: "Reportar incidencia" })
    .click();
  await expect(student.page.getByRole("status")).toHaveText(
    "Incidencia reportada.",
  );
  await expect(notificationsLink(student.page)).toHaveAccessibleName(
    "Notificaciones",
  );
  await student.context.close();

  const email = await emailTo(
    lab.users.reviewer.email,
    "Nueva incidencia de severidad alta · Laboratorio e2e",
  );
  expect(email).toContain(`/app/labs/${lab.slug}/incidents/`);
  expect(email).not.toContain("Fuga de aceite");

  const { context, page } = await openAs(browser, testInfo, lab.users.reviewer);
  await page.goto("/app");
  await expect(notificationsLink(page)).toHaveAccessibleName(
    "Notificaciones 1 sin leer",
  );
  await notificationsLink(page).click();
  await expect(
    page.getByRole("heading", { name: "Notificaciones" }),
  ).toBeVisible();
  const list = page.getByRole("list", { name: "Notificaciones recientes" });
  await expect(list).toContainText("Nueva incidencia de severidad alta");
  await expect(list).toContainText(
    "Torno e2e · Área de máquinas e2e · Severidad alta",
  );
  await expectNoHorizontalOverflow(page);
  await page
    .getByRole("button", { name: "Abrir: Nueva incidencia de severidad alta" })
    .click();
  await expect(page).toHaveURL(/\/incidents\/[0-9a-f-]+\?scope=laboratory$/);
  await expect(
    page.getByRole("heading", { name: "Recurso: Torno e2e" }),
  ).toBeVisible();
  await expect(notificationsLink(page)).toHaveAccessibleName("Notificaciones");
  await context.close();
});

test("resolving the incident notifies its reporter in-app and by email", async ({
  browser,
}, testInfo) => {
  const reviewer = await openAs(browser, testInfo, lab.users.reviewer);
  await reviewer.page.goto(`/app/labs/${lab.slug}/incidents?scope=laboratory`);
  await reviewer.page.getByRole("link", { name: "Recurso: Torno e2e" }).click();
  await reviewer.page.getByLabel("Nota de revisión").fill("Revisión e2e");
  await reviewer.page.getByRole("button", { name: "Pasar a revisión" }).click();
  await reviewer.page.getByLabel("Nota de resolución").fill("Sello cambiado");
  await reviewer.page
    .getByRole("button", { name: "Resolver incidencia" })
    .click();
  await expect(
    reviewer.page.getByText("Resuelta · Severidad alta"),
  ).toBeVisible();
  await reviewer.context.close();

  const email = await emailTo(
    lab.users.student.email,
    "Tu incidencia fue resuelta · Laboratorio e2e",
  );
  expect(email).toContain("?scope=own");

  const { context, page } = await openAs(browser, testInfo, lab.users.student);
  await page.goto("/app/notifications");
  await expect(
    page.getByRole("list", { name: "Notificaciones recientes" }),
  ).toContainText("Tu incidencia fue resuelta");
  await expect(notificationsLink(page)).toHaveAccessibleName(
    "Notificaciones 1 sin leer",
  );
  await page.getByRole("button", { name: "Marcar todas como leídas" }).click();
  await expect(notificationsLink(page)).toHaveAccessibleName("Notificaciones");
  await expect(
    page.getByRole("list", { name: "Notificaciones recientes" }),
  ).toContainText("Leída");
  await context.close();
});
