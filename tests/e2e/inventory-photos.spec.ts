import { expect, test } from "@playwright/test";
import { seedLaboratory, type SeededLaboratory } from "./support/seed";
import { expectNoHorizontalOverflow, openAs } from "./support/session";

// Inventory photos (ADR 0026): a photo with a note when registering an item or
// later from its detail; phones also offer the camera. Photos are re-encoded
// to JPEG in the browser before the upload.
test.describe.configure({ mode: "serial" });

let lab: SeededLaboratory;
const chooseFile = /^Elegir (archivo|de la galería)$/;
// 1x1 transparent PNG.
const png = (name: string) => ({
  name,
  mimeType: "image/png",
  buffer: Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
    "base64",
  ),
});
let itemUrl = "";

test.beforeAll(async () => {
  lab = await seedLaboratory({
    prefix: "e2e-inventory-photos",
    users: [
      {
        key: "manager",
        name: "Responsable e2e",
        permissions: [
          "location.read",
          "inventory.read",
          "inventory.manage",
          "inventory.adjust",
          "document.upload",
          "document.archive",
        ],
      },
      {
        key: "teacher",
        name: "Profesor e2e",
        permissions: ["inventory.read"],
      },
    ],
    resources: [],
  });
});

test.afterAll(async () => {
  await lab?.cleanup();
});

test("registering an item can attach a photo with a note", async ({
  browser,
}, testInfo) => {
  const { context, page } = await openAs(browser, testInfo, lab.users.manager);
  await page.goto(`/app/labs/${lab.slug}/inventory/new`);
  await page.getByLabel("Nombre").fill("Caja de llaves e2e");
  await page
    .getByRole("button", { name: chooseFile })
    .setInputFiles(png("caja-llaves.png"));
  await expect(page.getByText("caja-llaves.png")).toBeVisible();
  await page
    .getByLabel("Nota de la foto")
    .fill("A esta caja de llaves le falta una llave");
  await expectNoHorizontalOverflow(page);
  await page.getByRole("button", { name: "Registrar artículo" }).click();
  await expect(page).toHaveURL(/\/inventory\/[0-9a-f-]{36}\?created=1$/);
  itemUrl = new URL(page.url()).pathname;
  const photos = page.getByRole("region", { name: "Fotos y notas" });
  await expect(photos).toContainText(
    "A esta caja de llaves le falta una llave",
  );
  const link = photos.getByRole("link", { name: "caja-llaves.jpg" });
  await expect(link).toBeVisible();
  const image = await page.request.get((await link.getAttribute("href"))!);
  expect(image.status()).toBe(200);
  expect(image.headers()["content-type"]).toBe("image/jpeg");
  await context.close();
});

test("the detail adds photos; phones also offer the camera", async ({
  browser,
}, testInfo) => {
  const { context, page } = await openAs(browser, testInfo, lab.users.manager);
  await page.goto(itemUrl);
  const photos = page.getByRole("region", { name: "Fotos y notas" });
  await photos.getByText("Agregar foto").click();
  await expect(photos.locator('input[capture="environment"]')).toHaveCount(1);
  if (testInfo.project.name === "mobile")
    await expect(photos.getByText("Tomar foto")).toBeVisible();
  else await expect(photos.getByText("Tomar foto")).toBeHidden();
  await photos
    .getByRole("button", { name: chooseFile })
    .setInputFiles(png("estante.png"));
  await photos.getByLabel("Nota (opcional)").fill("Estante B, segundo nivel");
  await photos.getByRole("button", { name: "Subir" }).click();
  await expect(photos.getByRole("status")).toHaveText("Archivo guardado.");
  await expect(photos.getByRole("link", { name: "estante.jpg" })).toBeVisible();
  await expect(photos).toContainText("Estante B, segundo nivel");
  await expectNoHorizontalOverflow(page);
  await context.close();
});

test("readers see the photos but cannot add them", async ({
  browser,
}, testInfo) => {
  const { context, page } = await openAs(browser, testInfo, lab.users.teacher);
  await page.goto(itemUrl);
  const photos = page.getByRole("region", { name: "Fotos y notas" });
  await expect(photos.getByRole("link", { name: "estante.jpg" })).toBeVisible();
  await expect(photos.getByText("Agregar foto")).toHaveCount(0);
  await expect(photos.getByText("Archivar")).toHaveCount(0);
  await context.close();
});
