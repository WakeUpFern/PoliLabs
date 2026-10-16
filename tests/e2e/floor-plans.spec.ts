import { expect, test } from "@playwright/test";
import { localDateTime } from "../../src/modules/reservations/web/calendar";
import { seedLaboratory, type SeededLaboratory } from "./support/seed";
import { expectNoHorizontalOverflow, openAs } from "./support/session";

// Spatial III and Reservations III (ADR 0020): a manager draws a floor plan,
// a student books a free resource from it and both see the reservation on
// the plan and in the calendar (SRS §33 criteria 4 and 6).
test.describe.configure({ mode: "serial" });

let lab: SeededLaboratory;
const reader = ["space.read", "resource.read", "location.read"];
const booking = [
  "reservation.read",
  "reservation.create",
  "reservation.cancel",
];
// A whole hour two days ahead, in America/Mexico_City wall time.
const day = localDateTime(Date.now() + 2 * 86_400_000).slice(0, 10);
const start = `${day}T10:00`;
const end = `${day}T11:00`;
let planPath = "";

test.beforeAll(async () => {
  lab = await seedLaboratory({
    prefix: "e2e-floor-plans",
    users: [
      {
        key: "manager",
        name: "Responsable e2e",
        permissions: [...reader, ...booking, "space.manage"],
      },
      {
        key: "student",
        name: "Alumno e2e",
        permissions: [...reader, ...booking],
      },
    ],
    resources: ["Torno e2e", "Fresadora e2e"],
  });
});

test.afterAll(async () => {
  await lab?.cleanup();
});

test("manager configures a plan with visible resources", async ({
  browser,
}, testInfo) => {
  const { context, page } = await openAs(browser, testInfo, lab.users.manager);
  await page.goto(`/app/labs/${lab.slug}/spaces/${lab.space.slug}`);
  await expect(page.getByRole("heading", { name: "Planos" })).toBeVisible();
  await page.getByLabel("Nombre del plano").fill("Planta e2e");
  await page.getByLabel("Ancho (celdas)").fill("12");
  await page.getByLabel("Alto (celdas)").fill("6");
  await page.getByRole("button", { name: "Crear plano" }).click();

  await expect(page.getByRole("heading", { name: "Planta e2e" })).toBeVisible();
  planPath = new URL(page.url()).pathname;
  await expect(
    page.getByText("El plano todavía no tiene elementos."),
  ).toBeVisible();
  // Each placed element also has its own collapsed position form.
  const placer = page.locator("form").filter({
    has: page.getByRole("button", { name: "Colocar en el plano" }),
  });

  await placer
    .getByLabel("Recurso", { exact: true })
    .selectOption({ label: "Torno e2e" });
  await placer.getByLabel("Columna (x)").fill("1");
  await placer.getByLabel("Fila (y)").fill("1");
  await placer.getByLabel("Ancho", { exact: true }).fill("3");
  await placer.getByLabel("Alto", { exact: true }).fill("2");
  await placer.getByRole("button", { name: "Colocar en el plano" }).click();
  await expect(placer.getByText("Elemento colocado.")).toBeVisible();

  // An element that does not fit is rejected with a public message.
  await placer.getByLabel("Tipo de elemento").selectOption("label");
  await placer.getByLabel("Texto").fill("Puerta");
  await placer.getByLabel("Columna (x)").fill("11");
  await placer.getByLabel("Fila (y)").fill("5");
  await placer.getByLabel("Ancho", { exact: true }).fill("2");
  await placer.getByLabel("Alto", { exact: true }).fill("1");
  await placer.getByRole("button", { name: "Colocar en el plano" }).click();
  await expect(
    placer.getByText("El elemento no cabe en el plano."),
  ).toBeVisible();
  await placer.getByLabel("Columna (x)").fill("0");
  await placer.getByRole("button", { name: "Colocar en el plano" }).click();
  await expect(placer.getByText("Elemento colocado.")).toBeVisible();

  await page.reload();
  const plan = page.getByRole("img", { name: "Plano Planta e2e" });
  await expect(plan).toBeVisible();
  await expect(plan.locator("text", { hasText: "Puerta" })).toBeVisible();
  const placed = page
    .getByRole("list", { name: "Recursos en el plano" })
    .getByRole("listitem")
    .filter({ hasText: "Torno e2e" });
  await expect(placed).toContainText("Libre");
  await expectNoHorizontalOverflow(page);
  await context.close();
});

test("student books a free resource from the plan", async ({
  browser,
}, testInfo) => {
  const { context, page } = await openAs(browser, testInfo, lab.users.student);
  await page.goto(`${planPath}?start=${start}&end=${end}`);
  await expect(page.getByLabel("Desde")).toHaveValue(start);
  // Students without space.manage see the plan but not its editor.
  await expect(
    page.getByRole("button", { name: "Colocar en el plano" }),
  ).toHaveCount(0);
  await page.getByRole("link", { name: "Reservar Torno e2e" }).click();

  await expect(
    page.getByRole("heading", { name: "Nueva reservación" }),
  ).toBeVisible();
  await expect(page.getByLabel("Espacio", { exact: true })).toHaveValue(
    lab.space.id,
  );
  await expect(page.getByRole("checkbox", { name: /Torno e2e/ })).toBeChecked();
  await expect(page.getByLabel("Fecha y hora de inicio")).toHaveValue(start);
  await page.getByRole("button", { name: "Confirmar reservación" }).click();
  await expect(
    page.getByText("Reservación creada correctamente."),
  ).toBeVisible();

  await page.goto(`${planPath}?start=${start}&end=${end}`);
  const placed = page
    .getByRole("list", { name: "Recursos en el plano" })
    .getByRole("listitem")
    .filter({ hasText: "Torno e2e" });
  await expect(placed).toContainText("Ocupado");
  await expect(
    page.getByRole("link", { name: "Reservar Torno e2e" }),
  ).toHaveCount(0);
  await expect(page.getByText(/Mi reservación · Torno e2e/)).toBeVisible();
  await context.close();
});

test("the calendar shows the reservation without revealing its owner", async ({
  browser,
}, testInfo) => {
  const student = await openAs(browser, testInfo, lab.users.student);
  await student.page.goto(
    `/app/labs/${lab.slug}/reservations/calendar?view=week&date=${day}`,
  );
  await expect(
    student.page.getByRole("heading", { name: "Calendario de reservaciones" }),
  ).toBeVisible();
  const own = student.page.getByRole("link", {
    name: /Mi reservación · Torno e2e/,
  });
  await expect(own).toContainText("10:00–11:00");
  await own.click();
  await expect(student.page).toHaveURL(/\/reservations\/[0-9a-f-]{36}$/);
  await student.context.close();

  const { context, page } = await openAs(browser, testInfo, lab.users.manager);
  await page.goto(
    `/app/labs/${lab.slug}/reservations/calendar?view=month&date=${day}`,
  );
  await page.getByRole("link", { name: "Día" }).click();
  await expect(page.getByText("Ocupado · Torno e2e")).toBeVisible();
  await expect(page.getByText("Alumno e2e")).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Ocupado/ })).toHaveCount(0);

  // Filtering by the other resource hides the lathe's reservation.
  await page.getByLabel("Recurso").selectOption({ label: "Fresadora e2e" });
  await page.getByRole("button", { name: "Mostrar" }).click();
  await expect(page.getByText("Sin reservaciones")).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await context.close();
});
