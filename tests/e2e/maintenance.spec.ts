import { expect, test } from "@playwright/test";
import { eq } from "drizzle-orm";
import { inventoryStocks } from "../../src/modules/inventory/infrastructure/inventory-schema";
import { seedLaboratory, type SeededLaboratory } from "./support/seed";
import { expectNoHorizontalOverflow, openAs, signIn } from "./support/session";

// Maintenance I (ADR 0015): a log entry changes the operational status,
// consumes materials atomically and RB5 hides the resource from new bookings.
test.describe.configure({ mode: "serial" });

let lab: SeededLaboratory;
const reservationPermissions = [
  "space.read",
  "resource.read",
  "location.read",
  "reservation.read",
  "reservation.create",
];

test.beforeAll(async () => {
  lab = await seedLaboratory({
    prefix: "e2e-maintenance",
    users: [
      {
        key: "manager",
        name: "Responsable e2e",
        permissions: [
          ...reservationPermissions,
          "maintenance.read",
          "maintenance.create",
          "inventory.read",
          "inventory.manage",
          "inventory.adjust",
        ],
      },
      {
        key: "student",
        name: "Alumno e2e",
        permissions: reservationPermissions,
      },
    ],
    resources: ["Torno e2e", "Fresadora e2e"],
    items: [
      { name: "Aceite e2e", type: "consumable", unit: "litre", quantity: "5" },
    ],
  });
});

test.afterAll(async () => {
  await lab?.cleanup();
});

const oilStock = async () =>
  (
    await lab.db
      .select({ quantity: inventoryStocks.quantity })
      .from(inventoryStocks)
      .where(eq(inventoryStocks.itemId, lab.items["Aceite e2e"].id))
  )[0].quantity;

test("manager records an out-of-service entry with consumed oil", async ({
  page,
}) => {
  await signIn(page, lab.users.manager.email);
  await page.goto(`/app/labs/${lab.slug}`);
  await page.getByRole("link", { name: "Mantenimiento" }).click();
  await expect(
    page.getByRole("heading", { name: "Mantenimiento" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Torno e2e" }).click();
  await expect(page.getByRole("heading", { name: "Torno e2e" })).toBeVisible();

  await page.getByLabel("Tipo").selectOption("corrective");
  await page.getByLabel("Estado resultante").selectOption("out_of_service");
  await page.getByLabel("Descripción").fill("Cabezal desmontado para revisión");
  await page.getByRole("button", { name: "Añadir material" }).click();
  await page
    .getByLabel("Artículo")
    .selectOption({ label: "Aceite e2e · existencia 5.000 L" });
  await page.getByLabel("Cantidad").fill("0.5");
  await page.getByRole("button", { name: "Guardar entrada" }).click();

  await expect(page.getByRole("status")).toHaveText(
    "Entrada de mantenimiento guardada.",
  );
  await expect(
    page.getByText(
      "No se aceptan nuevas reservaciones de este recurso ni nuevos usos.",
    ),
  ).toBeVisible();
  const entry = page.getByRole("article").filter({
    hasText: "Cabezal desmontado para revisión",
  });
  await expect(entry).toContainText("En operación → Fuera de servicio");
  await expect(entry).toContainText("Aceite e2e: 0.500 L");
  await expect(entry).toContainText("Responsable e2e");
  expect(await oilStock()).toBe("4.500");
  await expectNoHorizontalOverflow(page);
});

test("insufficient stock saves nothing", async ({ browser }, testInfo) => {
  const { context, page } = await openAs(browser, testInfo, lab.users.manager);
  await page.goto(
    `/app/labs/${lab.slug}/maintenance/resources/${lab.resources["Torno e2e"].id}`,
  );
  await page.getByLabel("Descripción").fill("Intento con demasiado aceite");
  await page.getByRole("button", { name: "Añadir material" }).click();
  await page
    .getByLabel("Artículo")
    .selectOption({ label: "Aceite e2e · existencia 4.500 L" });
  await page.getByLabel("Cantidad").fill("10");
  await page.getByRole("button", { name: "Guardar entrada" }).click();

  await expect(page.locator("form").getByRole("alert")).toContainText(
    "Existencia insuficiente",
  );
  await page.reload();
  await expect(page.getByText("Intento con demasiado aceite")).toHaveCount(0);
  expect(await oilStock()).toBe("4.500");
  await context.close();
});

test("student cannot open maintenance and sees the lathe unavailable", async ({
  browser,
}, testInfo) => {
  const { context, page } = await openAs(browser, testInfo, lab.users.student);
  const denied = await page.goto(`/app/labs/${lab.slug}/maintenance`);
  expect(denied?.status()).toBe(404);

  await page.goto(`/app/labs/${lab.slug}/reservations/new`);
  await page
    .getByLabel("Espacio")
    .selectOption({ label: "Área de máquinas e2e" });
  await page.getByLabel("Uno o varios recursos").check();
  await expect(
    page.getByRole("checkbox", { name: /Torno e2e/ }),
  ).toBeDisabled();
  await expect(
    page.getByRole("checkbox", { name: /Torno e2e/ }),
  ).toHaveAccessibleName(/No disponible/);
  await expect(
    page.getByRole("checkbox", { name: /Fresadora e2e/ }),
  ).toBeEnabled();
  await expectNoHorizontalOverflow(page);
  await context.close();
});

test("returning the lathe to operation makes it bookable again", async ({
  browser,
}, testInfo) => {
  const { context: manager, page: managerPage } = await openAs(
    browser,
    testInfo,
    lab.users.manager,
  );
  await managerPage.goto(
    `/app/labs/${lab.slug}/maintenance/resources/${lab.resources["Torno e2e"].id}`,
  );
  await managerPage.getByLabel("Tipo").selectOption("inspection");
  await managerPage.getByLabel("Estado resultante").selectOption("operational");
  await managerPage.getByLabel("Descripción").fill("Cabezal reinstalado");
  await managerPage.getByRole("button", { name: "Guardar entrada" }).click();
  await expect(managerPage.getByRole("status")).toHaveText(
    "Entrada de mantenimiento guardada.",
  );
  await manager.close();

  const { context: student, page: studentPage } = await openAs(
    browser,
    testInfo,
    lab.users.student,
  );
  await studentPage.goto(`/app/labs/${lab.slug}/reservations/new`);
  await studentPage
    .getByLabel("Espacio")
    .selectOption({ label: "Área de máquinas e2e" });
  await studentPage.getByLabel("Uno o varios recursos").check();
  await expect(
    studentPage.getByRole("checkbox", { name: /Torno e2e/ }),
  ).toBeEnabled();
  await student.close();
});
