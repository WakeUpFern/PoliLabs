import { expect, test, type Page } from "@playwright/test";
import {
  formatCalendarDay,
  localDateTime,
} from "../../src/modules/reservations/web/calendar";
import { seedLaboratory, type SeededLaboratory } from "./support/seed";
import { expectNoHorizontalOverflow, openAs } from "./support/session";

// Reservations IV (ADR 0021): Reservaciones opens on an interactive grid.
// A student books by dragging (desktop) or tapping (mobile) a free slot and
// from the "Nueva reservación" panel; others only see the slot as occupied.
test.describe.configure({ mode: "serial" });

let lab: SeededLaboratory;
const permissions = [
  "space.read",
  "resource.read",
  "location.read",
  "reservation.read",
  "reservation.create",
  "reservation.cancel",
];
// Two days ahead, in America/Mexico_City wall time.
const day = localDateTime(Date.now() + 2 * 86_400_000).slice(0, 10);
const SLOT_PX = 28;

test.beforeAll(async () => {
  lab = await seedLaboratory({
    prefix: "e2e-reservations-grid",
    users: [
      { key: "student", name: "Alumno grid e2e", permissions },
      { key: "other", name: "Otra persona e2e", permissions },
    ],
    resources: ["Torno grid", "Fresadora grid"],
  });
});

test.afterAll(async () => {
  await lab?.cleanup();
});

// Page coordinates of a time inside a day column, with the column's scroll
// container brought to the top of the viewport.
async function pointAt(page: Page, hour: number, minute = 0) {
  const column = page.getByRole("group", {
    name: formatCalendarDay(day, "long"),
  });
  await column.evaluate((element) =>
    element.closest(".overflow-auto")?.scrollIntoView({ block: "start" }),
  );
  const box = await column.boundingBox();
  if (!box) throw new Error("Day column not rendered");
  return {
    x: box.x + box.width / 2,
    y: box.y + ((hour * 60 + minute) / 30) * SLOT_PX + SLOT_PX / 2,
  };
}

test("student books a resource by selecting a slot on the grid", async ({
  browser,
}, testInfo) => {
  const { context, page } = await openAs(browser, testInfo, lab.users.student);
  const mobile = testInfo.project.name === "mobile";
  if (mobile) {
    // Phones open on the day view when no view was chosen.
    await page.goto(`/app/labs/${lab.slug}/reservations`);
    await expect(page).toHaveURL(/view=day/);
  }
  await page.goto(`/app/labs/${lab.slug}/reservations?view=day&date=${day}`);
  await expect(
    page.getByRole("heading", { name: "Reservaciones", exact: true }),
  ).toBeVisible();

  if (mobile) {
    const point = await pointAt(page, 10);
    await page.touchscreen.tap(point.x, point.y);
  } else {
    const from = await pointAt(page, 10);
    const to = await pointAt(page, 11);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 5 });
    await page.mouse.up();
  }

  const panel = page.getByRole("dialog", { name: /Reservar en/ });
  await expect(panel).toBeVisible();
  await expect(panel.getByLabel("Fecha")).toHaveValue(day);
  await expect(panel.getByLabel("Inicio")).toHaveValue("10:00");
  // A drag from 10:00 through the 11:00 slot spans 1 h 30 min; a tap, 1 h.
  await expect(panel.getByLabel("Duración")).toHaveValue(mobile ? "60" : "90");
  await panel.getByLabel("Duración").selectOption("60");
  await panel.getByLabel("Uno o varios recursos").check();
  await panel.getByRole("checkbox", { name: /Torno grid/ }).check();
  await panel.getByRole("button", { name: "Reservar" }).click();

  await expect(page.getByText("Reservación creada.")).toBeVisible();
  await expect(panel).toHaveCount(0);
  const own = page.getByRole("link", { name: /Mi reservación · Torno grid/ });
  await expect(own).toContainText("10:00–11:00");
  await expectNoHorizontalOverflow(page);
  await context.close();
});

test("the panel shows occupied resources and books the whole space", async ({
  browser,
}, testInfo) => {
  const { context, page } = await openAs(browser, testInfo, lab.users.student);
  await page.goto(`/app/labs/${lab.slug}/reservations?view=week&date=${day}`);
  await page.getByRole("button", { name: "Nueva reservación" }).click();
  const panel = page.getByRole("dialog", { name: /Reservar en/ });
  await panel.getByLabel("Fecha").fill(day);
  await panel.getByLabel("Inicio").fill("10:00");
  await panel.getByLabel("Duración").selectOption("60");

  await panel.getByLabel("Uno o varios recursos").check();
  await expect(
    panel.getByRole("checkbox", { name: /Torno grid/ }),
  ).toBeDisabled();
  await expect(panel.getByText("Ocupado en ese horario")).toBeVisible();
  await panel.getByLabel("Espacio completo").check();
  await expect(panel.getByRole("button", { name: "Reservar" })).toBeDisabled();

  await panel.getByLabel("Inicio").fill("13:00");
  await expect(panel.getByRole("button", { name: "Reservar" })).toBeEnabled();
  await panel.getByRole("button", { name: "Reservar" }).click();
  await expect(page.getByText("Reservación creada.")).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Mi reservación · Espacio completo/ }),
  ).toContainText("13:00–14:00");
  await context.close();
});

test("another person sees the slots as occupied without the owner", async ({
  browser,
}, testInfo) => {
  const { context, page } = await openAs(browser, testInfo, lab.users.other);
  await page.goto(`/app/labs/${lab.slug}/reservations?view=day&date=${day}`);
  await expect(page.getByText("Ocupado · Torno grid")).toBeVisible();
  await expect(page.getByText("Ocupado · Espacio completo")).toBeVisible();
  await expect(page.getByText("Alumno grid e2e")).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Ocupado/ })).toHaveCount(0);

  // "Mis reservaciones" stays available as a list.
  await page.getByRole("link", { name: "Mis reservaciones" }).click();
  await expect(
    page.getByText("Todavía no tienes reservaciones en este laboratorio."),
  ).toBeVisible();
  await context.close();
});
