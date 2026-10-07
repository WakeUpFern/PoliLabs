import { expect, test } from "@playwright/test";
import { MaintenanceService } from "../../src/modules/maintenance/application/maintenance";
import { DrizzleMaintenanceStore } from "../../src/modules/maintenance/infrastructure/maintenance-store";
import { seedLaboratory, type SeededLaboratory } from "./support/seed";
import { expectNoHorizontalOverflow, openAs } from "./support/session";

// Documents I (ADR 0016): manuals per resource, evidence appended to an
// immutable maintenance entry and downloads only through the authorized route.
test.describe.configure({ mode: "serial" });

let lab: SeededLaboratory;
let logId: string;
const pdf = {
  name: "manual-torno.pdf",
  mimeType: "application/pdf",
  buffer: Buffer.from("%PDF-1.4\n% synthetic e2e manual\n%%EOF\n"),
};
// 1x1 transparent PNG.
const png = {
  name: "bitacora-escrita.png",
  mimeType: "image/png",
  buffer: Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
    "base64",
  ),
};
let pdfUrl = "";
let evidenceUrl = "";

test.beforeAll(async () => {
  lab = await seedLaboratory({
    prefix: "e2e-documents",
    users: [
      {
        key: "manager",
        name: "Responsable e2e",
        permissions: [
          "space.read",
          "resource.read",
          "location.read",
          "maintenance.read",
          "maintenance.create",
          "document.read",
          "document.upload",
          "document.archive",
        ],
      },
      {
        key: "student",
        name: "Alumno e2e",
        permissions: ["space.read", "resource.read", "location.read"],
      },
    ],
    resources: ["Torno e2e"],
  });
  const log = await new MaintenanceService(
    new DrizzleMaintenanceStore(lab.db),
  ).record({
    actorUserId: lab.users.manager.id,
    laboratoryId: lab.labId,
    source: "SYSTEM",
    resourceId: lab.resources["Torno e2e"].id,
    type: "preventive",
    description: "Lubricación registrada en bitácora en papel",
    statusAfter: "operational",
    performedAt: new Date(Date.now() - 3600000).toISOString(),
  });
  logId = log.id;
});

test.afterAll(async () => {
  await lab?.cleanup();
});

const documentsPath = () =>
  `/app/labs/${lab.slug}/resources/${lab.resources["Torno e2e"].id}/documents`;
const maintenancePath = () =>
  `/app/labs/${lab.slug}/maintenance/resources/${lab.resources["Torno e2e"].id}`;

test("manager uploads a manual that is served only through the authorized route", async ({
  browser,
}, testInfo) => {
  const { context, page } = await openAs(browser, testInfo, lab.users.manager);
  await page.goto(documentsPath());
  await expect(
    page.getByRole("heading", { name: "Documentos de Torno e2e" }),
  ).toBeVisible();
  await page.getByLabel("Título (opcional)").fill("Manual del torno");
  await page.getByLabel("Archivo").setInputFiles(pdf);
  await page.getByRole("button", { name: "Subir" }).click();
  await expect(page.locator("form").getByRole("status")).toHaveText(
    "Archivo guardado.",
  );
  const link = page.getByRole("link", { name: "Manual del torno" });
  await expect(link).toBeVisible();
  pdfUrl = (await link.getAttribute("href"))!;

  const download = await page.request.get(pdfUrl);
  expect(download.status()).toBe(200);
  expect(download.headers()["content-type"]).toBe("application/pdf");
  expect(download.headers()["x-content-type-options"]).toBe("nosniff");
  expect(download.headers()["cache-control"]).toContain("no-store");
  expect(await download.body()).toEqual(pdf.buffer);
  await expectNoHorizontalOverflow(page);
  await context.close();
});

test("content is verified by its bytes and uploads require the app origin", async ({
  browser,
}, testInfo) => {
  const { context, page } = await openAs(browser, testInfo, lab.users.manager);
  await page.goto(documentsPath());
  await page.getByLabel("Archivo").setInputFiles({
    name: "no-es-pdf.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("texto plano disfrazado de PDF"),
  });
  await page.getByRole("button", { name: "Subir" }).click();
  await expect(page.locator("form").getByRole("alert")).toContainText(
    "Formato no admitido",
  );

  const foreign = await page.request.post(`/app/labs/${lab.slug}/documents`, {
    headers: { origin: "http://evil.invalid" },
    multipart: {
      targetKind: "resource",
      targetId: lab.resources["Torno e2e"].id,
      file: pdf,
    },
  });
  expect(foreign.status()).toBe(403);
  await context.close();
});

test("evidence is appended to the maintenance entry without changing it", async ({
  browser,
}, testInfo) => {
  const { context, page } = await openAs(browser, testInfo, lab.users.manager);
  await page.goto(maintenancePath());
  const entry = page.getByRole("article").filter({
    hasText: "Lubricación registrada en bitácora en papel",
  });
  await expect(entry).toContainText("Sin evidencia adjunta.");
  await entry.getByText("Añadir evidencia").click();
  await entry.getByLabel("Foto o documento").setInputFiles(png);
  await entry.getByRole("button", { name: "Subir" }).click();
  await expect(entry.getByRole("status")).toHaveText("Archivo guardado.");
  const evidence = entry.getByRole("link", { name: png.name });
  await expect(evidence).toBeVisible();
  await expect(entry).toContainText(
    "Lubricación registrada en bitácora en papel",
  );
  evidenceUrl = (await evidence.getAttribute("href"))!;
  expect(evidenceUrl).toContain(`/app/labs/${lab.slug}/documents/`);
  const image = await page.request.get(evidenceUrl);
  expect(image.status()).toBe(200);
  expect(image.headers()["content-type"]).toBe("image/png");
  expect(logId).toBeTruthy();
  await context.close();
});

test("archiving hides the manual and its URL stops serving", async ({
  browser,
}, testInfo) => {
  const { context, page } = await openAs(browser, testInfo, lab.users.manager);
  await page.goto(documentsPath());
  const item = page
    .getByRole("listitem")
    .filter({ hasText: "Manual del torno" });
  await item.getByText("Archivar").click();
  await item.getByLabel("Motivo").fill("Versión obsoleta del manual");
  await item.getByRole("button", { name: "Confirmar archivado" }).click();
  await expect(
    page.getByRole("link", { name: "Manual del torno" }),
  ).toHaveCount(0);
  expect((await page.request.get(pdfUrl)).status()).toBe(404);
  await context.close();
});

test("a member without document permissions gets uniform 404s", async ({
  browser,
}, testInfo) => {
  const { context, page } = await openAs(browser, testInfo, lab.users.student);
  expect((await page.goto(documentsPath()))?.status()).toBe(404);
  expect((await page.request.get(evidenceUrl)).status()).toBe(404);
  const upload = await page.request.post(`/app/labs/${lab.slug}/documents`, {
    headers: { origin: new URL(page.url()).origin },
    multipart: {
      targetKind: "resource",
      targetId: lab.resources["Torno e2e"].id,
      file: pdf,
    },
  });
  expect(upload.status()).toBe(403);
  await context.close();
});
