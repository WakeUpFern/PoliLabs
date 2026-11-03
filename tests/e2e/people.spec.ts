import { expect, test } from "@playwright/test";
import { eq } from "drizzle-orm";
import { users } from "../../src/modules/identity/infrastructure/auth-schema";
import { LABORATORY_ROLE_CATALOG } from "../../src/modules/identity/domain/access-catalog";
import { ensureRoleCatalog } from "../../src/modules/identity/infrastructure/role-catalog";
import { seedLaboratory, type SeededLaboratory } from "./support/seed";
import { expectNoHorizontalOverflow, openAs } from "./support/session";
import { laboratorySections, openSection } from "./support/navigation";

// ADR 0022: a teacher finds "Personas" in the side menu, creates a student
// with a temporary password, the student is made to choose their own password
// and lands on a home that follows the practice; then the teacher removes it.
test.describe.configure({ mode: "serial" });

let lab: SeededLaboratory;
const teacherRole = LABORATORY_ROLE_CATALOG.find(
  (role) => role.key === "laboratory_teacher",
)!;

test.beforeAll(async () => {
  lab = await seedLaboratory({
    prefix: "e2e-people",
    users: [
      {
        key: "teacher",
        name: "Profesora e2e",
        permissions: [...teacherRole.permissions],
      },
    ],
    resources: [],
  });
  await ensureRoleCatalog(lab.db);
});

test.afterAll(async () => {
  await lab?.cleanup();
});

test("a teacher enrols a student who then sets their own password", async ({
  browser,
}, testInfo) => {
  const email = `e2e-people-student-${testInfo.project.name}-${lab.slug}@invalid.test`;
  const teacher = await openAs(browser, testInfo, lab.users.teacher);
  const page = teacher.page;

  await page.goto(`/app/labs/${lab.slug}`);
  await expect(
    page.getByRole("heading", { name: "Tus próximas sesiones" }),
  ).toBeVisible();
  // Header menus are native popovers: Escape and a click outside close them.
  const accountMenu = page.locator("#account-menu");
  await page.getByRole("button", { name: "Cuenta" }).click();
  await expect(accountMenu.getByText(lab.users.teacher.email)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(accountMenu).toBeHidden();
  await page.getByRole("button", { name: "Cuenta" }).click();
  await expect(accountMenu).toBeVisible();
  // The menu opens at the right; the heading's left edge stays uncovered on phones.
  await page
    .getByRole("heading", { name: "Tus próximas sesiones" })
    .click({ position: { x: 2, y: 2 } });
  await expect(accountMenu).toBeHidden();
  await openSection(page, "Personas");
  await expect(page.getByRole("dialog", { name: "Más" })).toBeHidden();
  await expect(page.getByRole("heading", { name: "Personas" })).toBeVisible();

  await page.getByRole("button", { name: "Agregar persona" }).click();
  await page.getByLabel("Nombre completo").fill("Alumna e2e");
  await page.getByLabel("Correo").fill(email.toUpperCase());
  await expect(page.getByRole("radio", { name: /^Alumno/ })).toBeChecked();
  await expect(page.getByRole("radio", { name: /^Responsable/ })).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  const temporary = page.getByLabel("Contraseña temporal");
  await expect(temporary).toBeVisible();
  const password = (await temporary.textContent())!.trim();
  expect(password).toMatch(/^[a-z2-9]{5}(-[a-z2-9]{5}){3}$/);
  const [created] = await lab.db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(eq(users.email, email));
  // Registered so the laboratory cleanup removes this account as well.
  lab.users[`student-${testInfo.project.name}`] = {
    id: created.id,
    email,
    name: created.name,
    cookies: [],
  };
  const row = page.getByRole("listitem").filter({ hasText: email });
  await expect(row).toContainText("Aún no cambia su contraseña");
  await expectNoHorizontalOverflow(page);

  // The student signs in with the temporary password through the real form.
  const context = await browser.newContext(testInfo.project.use);
  const student = await context.newPage();
  await student.goto("/login");
  await student.getByLabel("Correo").fill(email);
  await student.getByLabel("Contraseña").fill(password);
  await student.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(student).toHaveURL(/\/app\/account\/security/);
  await expect(student.getByText("Elige tu propia contraseña")).toBeVisible();
  await student.goto(`/app/labs/${lab.slug}`);
  await expect(student).toHaveURL(/\/app\/account\/security/);

  const chosen = "una frase de paso e2e bastante larga";
  await student.getByLabel("Contraseña actual").fill(password);
  await student.getByLabel("Contraseña nueva", { exact: true }).fill(chosen);
  await student.getByLabel("Confirmar contraseña nueva").fill(chosen);
  await student.getByRole("button", { name: "Cambiar contraseña" }).click();
  await expect(student).toHaveURL(new RegExp(`/app/labs/${lab.slug}$`));
  const sections = await laboratorySections(student);
  await expect(sections).toContainText("Asistencia");
  await expect(sections).not.toContainText("Personas");
  await student.keyboard.press("Escape");
  await expect(
    student.getByRole("heading", { name: "Tus próximas sesiones" }),
  ).toBeVisible();
  await expectNoHorizontalOverflow(student);

  // Back to the teacher: the account is now active, then access is removed.
  await page.reload();
  await expect(row).toContainText("Activo");
  page.once("dialog", (dialog) => dialog.accept());
  await row.getByRole("button", { name: "Quitar acceso" }).click();
  await expect(row).toContainText("Sin acceso");
  await expect(
    row.getByRole("button", { name: "Devolver acceso" }),
  ).toBeVisible();

  await student.goto(`/app/labs/${lab.slug}`);
  await expect(
    student.getByText("No encontramos ese laboratorio"),
  ).toBeVisible();

  await context.close();
  await teacher.context.close();
});
