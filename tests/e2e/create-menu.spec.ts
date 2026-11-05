import { expect, test } from "@playwright/test";
import { LABORATORY_ROLE_CATALOG } from "../../src/modules/identity/domain/access-catalog";
import { seedLaboratory, type SeededLaboratory } from "./support/seed";
import { expectNoHorizontalOverflow, openAs } from "./support/session";
import { openCreateMenu } from "./support/navigation";

// ADR 0025: the phone's dock has a center button that opens what a person can
// create, decided from permissions and led by the section they are in. On a
// wide screen the same list is the header's "+" menu.
let lab: SeededLaboratory;
const role = (key: string) =>
  LABORATORY_ROLE_CATALOG.find((entry) => entry.key === key)!;

test.beforeAll(async () => {
  lab = await seedLaboratory({
    prefix: "e2e-create",
    users: [
      {
        key: "teacher",
        name: "Profesora e2e",
        permissions: [...role("laboratory_teacher").permissions],
      },
      {
        key: "student",
        name: "Alumno e2e",
        permissions: [...role("laboratory_student").permissions],
      },
    ],
    resources: [],
  });
});

test.afterAll(async () => {
  await lab?.cleanup();
});

test("each role creates what it can from the create menu", async ({
  browser,
}, testInfo) => {
  const teacher = await openAs(browser, testInfo, lab.users.teacher);
  let page = teacher.page;
  await page.goto(`/app/labs/${lab.slug}`);
  let menu = await openCreateMenu(page);
  await expect(menu.getByRole("link").first()).toContainText("Nueva práctica");
  await expect(
    menu.getByRole("link", { name: /Programar sesión/ }),
  ).toBeVisible();
  await expect(
    menu.getByRole("link", { name: /Usar una máquina/ }),
  ).toHaveCount(0);
  await expectNoHorizontalOverflow(page);

  // Inside a section, its own actions come first.
  await menu.getByRole("link", { name: /Reportar una falla/ }).click();
  await expect(
    page.getByRole("heading", { name: "Reportar incidencia" }),
  ).toBeVisible();
  menu = await openCreateMenu(page);
  await expect(menu.getByRole("link").first()).toContainText(
    "Reportar una falla",
  );
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await teacher.context.close();

  const student = await openAs(browser, testInfo, lab.users.student);
  page = student.page;
  await page.goto(`/app/labs/${lab.slug}`);
  menu = await openCreateMenu(page);
  await expect(menu.getByRole("link").first()).toContainText("Reservar");
  await expect(
    menu.getByRole("link", { name: /Registrar asistencia/ }),
  ).toBeVisible();
  await expect(menu.getByRole("link", { name: /Nueva práctica/ })).toHaveCount(
    0,
  );
  await student.context.close();
});
