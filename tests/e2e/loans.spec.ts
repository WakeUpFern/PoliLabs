import { expect, test, type Page } from "@playwright/test";
import { seedLaboratory, type SeededLaboratory } from "./support/seed";
import { expectNoHorizontalOverflow, openAs } from "./support/session";

// Loans I (ADR 0017): lending never changes stock, availability discounts
// outstanding pieces and damaged returns create a linked damage movement.
test.describe.configure({ mode: "serial" });

let lab: SeededLaboratory;

test.beforeAll(async () => {
  lab = await seedLaboratory({
    prefix: "e2e-loans",
    users: [
      {
        key: "manager",
        name: "Responsable e2e",
        permissions: [
          "inventory.read",
          "inventory.manage",
          "inventory.adjust",
          "inventory.loan",
          "inventory.loan.read",
        ],
      },
      {
        key: "student",
        name: "Alumno e2e",
        permissions: ["inventory.loan.read"],
      },
    ],
    resources: [],
    items: [
      {
        name: "Pinzas e2e",
        type: "reusable_tool",
        unit: "piece",
        quantity: "5",
      },
    ],
  });
});

test.afterAll(async () => {
  await lab?.cleanup();
});

const itemPath = () =>
  `/app/labs/${lab.slug}/inventory/${lab.items["Pinzas e2e"].id}`;

async function expectTotals(
  page: Page,
  stock: number,
  loaned: number,
  available: number,
) {
  for (const [label, value] of [
    ["Existencia", stock],
    ["Prestadas", loaned],
    ["Disponibles", available],
  ] as const)
    await expect(
      page
        .locator("div")
        .filter({ has: page.getByText(label, { exact: true }) })
        .last(),
    ).toContainText(`${value} pz`);
}

test("lending discounts availability without changing stock", async ({
  browser,
}, testInfo) => {
  const { context, page } = await openAs(browser, testInfo, lab.users.manager);
  await page.goto(itemPath());
  await expectTotals(page, 5, 0, 5);
  const lend = page.locator("form").filter({
    has: page.getByRole("button", { name: "Registrar préstamo" }),
  });
  await lend
    .getByLabel("Persona que recibe")
    .selectOption({ label: "Alumno e2e" });
  await lend.getByLabel("Piezas").fill("2");
  await lend.getByRole("button", { name: "Registrar préstamo" }).click();
  await expect(lend.getByRole("status")).toHaveText("Préstamo registrado.");
  await page.reload();
  await expectTotals(page, 5, 2, 3);
  await expect(
    page.getByRole("article").filter({ hasText: "Alumno e2e" }),
  ).toContainText("Pendientes: 2 pz");
  await expectNoHorizontalOverflow(page);
  await context.close();
});

test("a damaged return records a damage movement and the rest closes the loan", async ({
  browser,
}, testInfo) => {
  const { context, page } = await openAs(browser, testInfo, lab.users.manager);
  await page.goto(itemPath());
  const loan = page.getByRole("article").filter({ hasText: "Alumno e2e" });
  await loan.getByLabel("Piezas").fill("1");
  await loan.getByLabel("Estado al devolver").selectOption("damaged");
  await loan.getByLabel("Notas").fill("Punta doblada al devolver");
  await loan.getByRole("button", { name: "Registrar devolución" }).click();
  await expect(loan.getByRole("status")).toHaveText(
    "Devolución registrada. Quedan 1 pendientes.",
  );
  await page.reload();
  await expectTotals(page, 4, 1, 3);
  await expect(
    page.getByText("Punta doblada al devolver").first(),
  ).toBeVisible();

  const remaining = page.getByRole("article").filter({ hasText: "Alumno e2e" });
  await remaining.getByRole("button", { name: "Registrar devolución" }).click();
  // Closing re-renders the loan under the returned list, without its form.
  await expect(
    page.getByRole("heading", { name: "Préstamos devueltos recientes" }),
  ).toBeVisible();
  await expect(page.getByText("No hay préstamos activos.")).toBeVisible();
  await page.reload();
  await expectTotals(page, 4, 0, 4);
  const closed = page.getByRole("article").filter({ hasText: "Alumno e2e" });
  await expect(closed).toContainText("Devuelto");
  await expect(closed).toContainText("1 pz con daño");
  await expect(closed).toContainText("1 pz en buen estado");
  await context.close();
});

test("the borrower only sees their own loans", async ({
  browser,
}, testInfo) => {
  const { context, page } = await openAs(browser, testInfo, lab.users.student);
  await page.goto(`/app/labs/${lab.slug}/loans`);
  await expect(
    page.getByRole("heading", { name: "Mis préstamos" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Préstamos del laboratorio" }),
  ).toHaveCount(0);
  await expect(page.getByRole("article").first()).toContainText("Devuelto");
  expect((await page.goto(itemPath()))?.status()).toBe(404);
  await context.close();
});
