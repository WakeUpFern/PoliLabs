import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { seedLaboratory, type SeededLaboratory } from "./support/seed";
import { expectNoHorizontalOverflow, openAs } from "./support/session";

// Reports I (ADR 0018): exports reuse each domain's read permission and are
// generated per request as CSV or PDF attachments.
test.describe.configure({ mode: "serial" });

let lab: SeededLaboratory;

test.beforeAll(async () => {
  lab = await seedLaboratory({
    prefix: "e2e-reports",
    users: [
      // The seed creates items as the first user.
      {
        key: "seeder",
        name: "Sembrador e2e",
        permissions: ["inventory.manage", "inventory.adjust"],
      },
      {
        key: "keeper",
        name: "Almacén e2e",
        permissions: ["inventory.read"],
      },
      { key: "member", name: "Miembro e2e", permissions: [] },
    ],
    resources: [],
    items: [
      {
        name: "Pinzas e2e",
        type: "reusable_tool",
        unit: "piece",
        quantity: "5",
      },
      {
        name: 'Aceite, "especial"',
        type: "consumable",
        unit: "litre",
        quantity: "2.5",
      },
    ],
  });
});

test.afterAll(async () => {
  await lab?.cleanup();
});

async function download(page: Page, report: string, format: "CSV" | "PDF") {
  const card = page.getByRole("region", { name: report });
  const [file] = await Promise.all([
    page.waitForEvent("download"),
    card.getByRole("button", { name: `Descargar ${format}` }).click(),
  ]);
  return {
    name: file.suggestedFilename(),
    bytes: await readFile(await file.path()),
  };
}

test("an inventory reader exports stock as CSV and PDF", async ({
  browser,
}, testInfo) => {
  const { context, page } = await openAs(browser, testInfo, lab.users.keeper);
  await page.goto(`/app/labs/${lab.slug}`);
  await page.getByRole("link", { name: "Reportes" }).click();
  await expect(
    page.getByRole("heading", { name: "Reportes", level: 1 }),
  ).toBeVisible();
  // Only reports whose read permission the member holds are offered.
  await expect(page.getByRole("region")).toHaveCount(2);
  await expect(
    page.getByRole("region", { name: "Incidencias y seguimiento" }),
  ).toHaveCount(0);
  await expectNoHorizontalOverflow(page);

  const csv = await download(page, "Stock actual de inventario", "CSV");
  expect(csv.name).toMatch(/^inventory-stock-\d{4}-\d{2}-\d{2}\.csv$/);
  expect([...csv.bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  const lines = csv.bytes.toString("utf8").slice(1).trimEnd().split("\r\n");
  expect(lines).toEqual([
    "Artículo,Tipo,Unidad,Ubicación,Existencia,Prestado,Disponible",
    '"Aceite, ""especial""",Consumible,L,,2.500,0.000,2.500',
    "Pinzas e2e,Herramienta reutilizable,piezas,,5.000,0.000,5.000",
  ]);

  const pdf = await download(page, "Stock actual de inventario", "PDF");
  expect(pdf.name).toMatch(/^inventory-stock-\d{4}-\d{2}-\d{2}\.pdf$/);
  expect(pdf.bytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");

  const movements = await download(page, "Movimientos de inventario", "CSV");
  expect(movements.bytes.toString("utf8")).toContain(
    "Pinzas e2e,Existencia inicial,5.000",
  );
  await context.close();
});

test("an invalid period returns to the form without exporting", async ({
  browser,
}, testInfo) => {
  const { context, page } = await openAs(browser, testInfo, lab.users.keeper);
  await page.goto(`/app/labs/${lab.slug}/reports`);
  const card = page.getByRole("region", { name: "Movimientos de inventario" });
  await card.getByLabel("Desde").fill("2026-10-07");
  await card.getByLabel("Hasta").fill("2026-10-01");
  await card.getByRole("button", { name: "Descargar CSV" }).click();
  await expect(page).toHaveURL(/error=input/);
  await expect(
    page
      .getByRole("region", { name: "Movimientos de inventario" })
      .getByRole("alert"),
  ).toContainText("fecha inicial no posterior a la final");
  await context.close();
});

test("members without report permissions get no link and a 404", async ({
  browser,
}, testInfo) => {
  const { context, page } = await openAs(browser, testInfo, lab.users.member);
  await page.goto(`/app/labs/${lab.slug}`);
  await expect(page.getByRole("link", { name: "Reportes" })).toHaveCount(0);
  expect((await page.goto(`/app/labs/${lab.slug}/reports`))?.status()).toBe(
    404,
  );
  const response = await page.request.get(
    `/app/labs/${lab.slug}/reports/inventory-stock?format=csv`,
  );
  expect(response.status()).toBe(404);
  await context.close();
});
