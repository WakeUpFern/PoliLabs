import type { Locator, Page } from "@playwright/test";

/**
 * The laboratory's full list of sections: the sidebar on a wide screen, or
 * the "Más" sheet behind the phone's bottom bar (ADR 0023).
 */
export async function laboratorySections(page: Page): Promise<Locator> {
  const sidebar = page.getByRole("navigation", {
    name: "Secciones del laboratorio",
  });
  if (await sidebar.isVisible()) return sidebar;
  await page
    .getByRole("navigation", { name: "Accesos rápidos" })
    .getByRole("button", { name: "Más" })
    .click();
  return page
    .getByRole("dialog", { name: "Más" })
    .getByRole("navigation", { name: "Secciones del laboratorio" });
}

/** Opens a laboratory section the way a person would on this screen. */
export async function openSection(page: Page, name: string) {
  const sections = await laboratorySections(page);
  await sections.getByRole("link", { name, exact: true }).click();
}

/**
 * What this person can create: the header's "+" menu on a wide screen, or
 * the sheet behind the center button of the phone's dock (ADR 0025).
 */
export async function openCreateMenu(page: Page): Promise<Locator> {
  const dock = page.getByRole("navigation", { name: "Accesos rápidos" });
  if (await dock.isVisible()) {
    await dock.getByRole("button", { name: "Crear" }).click();
    return page.getByRole("dialog", { name: "Crear" });
  }
  await page.getByRole("banner").getByRole("button", { name: "Crear" }).click();
  return page.locator("#create-menu");
}
