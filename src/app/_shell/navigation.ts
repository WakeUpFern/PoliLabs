import { REPORT_LIST } from "@/modules/reports/domain/reports";

/**
 * Lab navigation follows the order work happens in a practice instead of the
 * order modules were built: prepare, run it, follow up. Labels change with
 * what the person can do (a teacher "pasa lista", a student "registra su
 * asistencia"), but every decision is made from permissions, never role keys.
 */

export type IconName =
  | "home"
  | "practices"
  | "calendar"
  | "attendance"
  | "machine"
  | "loans"
  | "incident"
  | "maintenance"
  | "reports"
  | "inventory"
  | "spaces"
  | "people"
  | "labs"
  | "bell"
  | "lock";

export type NavItem = {
  key: string;
  href: string;
  label: string;
  hint: string;
  icon: IconName;
  /** Active only on its own page, not on the pages below it. */
  exact?: boolean;
};

export type NavGroup = {
  key: string;
  title: string;
  /** One line that tells the person when this group matters. */
  summary: string;
  /** Present on the three practice phases, which are a real sequence. */
  step?: number;
  items: NavItem[];
};

export function labNavigation(
  slug: string,
  permissionKeys: readonly string[],
): { home: NavItem; groups: NavGroup[] } {
  const can = (key: string) => permissionKeys.includes(key);
  const base = `/app/labs/${encodeURIComponent(slug)}`;
  const item = (
    key: string,
    path: string,
    label: string,
    hint: string,
    icon: IconName,
  ): NavItem => ({ key, href: `${base}${path}`, label, hint, icon });

  const before: NavItem[] = [];
  if (can("academic.manage"))
    before.push(
      item(
        "academic",
        "/academic",
        "Prácticas y sesiones",
        "Publica instrucciones y programa sesiones con su grupo.",
        "practices",
      ),
    );
  else if (can("academic.read"))
    before.push(
      item(
        "academic",
        "/academic",
        "Mis prácticas",
        "Lee las instrucciones y revisa tus próximas sesiones.",
        "practices",
      ),
    );
  if (can("reservation.create"))
    before.push(
      item(
        "reservations",
        "/reservations",
        can("academic.manage") ? "Reservaciones" : "Reservar equipo",
        "Aparta un área o una máquina en el calendario.",
        "calendar",
      ),
    );
  else if (can("reservation.read"))
    before.push(
      item(
        "reservations",
        "/reservations",
        "Reservaciones",
        "Consulta qué está apartado y cuándo.",
        "calendar",
      ),
    );

  const during: NavItem[] = [];
  if (can("attendance.manage"))
    during.push(
      item(
        "attendance",
        "/attendance",
        "Pasar lista",
        "Revisa quién llegó a cada sesión y corrige la asistencia.",
        "attendance",
      ),
    );
  else if (can("attendance.checkin") || can("attendance.read"))
    during.push(
      item(
        "attendance",
        "/attendance",
        "Registrar asistencia",
        "Confirma que llegaste a tu sesión.",
        "attendance",
      ),
    );
  if (can("usage.record"))
    during.push(
      item(
        "usage",
        "/usage",
        "Usar una máquina",
        "Marca cuándo empiezas y terminas de usar un equipo.",
        "machine",
      ),
    );
  else if (can("usage.trace"))
    during.push(
      item(
        "usage",
        "/usage",
        "Uso de maquinaria",
        "Consulta quién usó cada equipo y cuándo.",
        "machine",
      ),
    );
  if (can("inventory.loan"))
    during.push(
      item(
        "loans",
        "/loans",
        "Préstamos",
        "Presta herramientas y registra lo que regresa.",
        "loans",
      ),
    );
  else if (can("inventory.loan.read"))
    during.push(
      item(
        "loans",
        "/loans",
        "Mis préstamos",
        "Revisa qué herramientas tienes y cuándo devolverlas.",
        "loans",
      ),
    );

  const after: NavItem[] = [];
  if (can("incident.review"))
    after.push(
      item(
        "incidents",
        can("incident.read") ? "/incidents?scope=laboratory" : "/incidents",
        "Incidencias",
        "Revisa las fallas reportadas y da seguimiento.",
        "incident",
      ),
    );
  else if (can("incident.create") || can("incident.read"))
    after.push(
      item(
        "incidents",
        can("incident.read") ? "/incidents" : "/incidents/new",
        "Reportar una falla",
        "Avisa si algo no funciona y sigue su atención.",
        "incident",
      ),
    );
  if (can("maintenance.read"))
    after.push(
      item(
        "maintenance",
        "/maintenance",
        "Mantenimiento",
        "Estado de cada máquina y su bitácora de servicio.",
        "maintenance",
      ),
    );
  if (REPORT_LIST.some((report) => can(report.permission)))
    after.push(
      item(
        "reports",
        "/reports",
        "Reportes",
        "Descarga resúmenes en CSV o PDF.",
        "reports",
      ),
    );

  const laboratory: NavItem[] = [];
  if (can("inventory.read"))
    laboratory.push(
      item(
        "inventory",
        "/inventory",
        "Inventario",
        "Materiales, herramientas y existencias.",
        "inventory",
      ),
    );
  if (can("space.read"))
    laboratory.push(
      item(
        "spaces",
        "/spaces",
        "Espacios y planos",
        "Áreas, máquinas y dónde está cada una.",
        "spaces",
      ),
    );
  if (can("laboratory.membership.manage"))
    laboratory.push(
      item(
        "people",
        "/people",
        "Personas",
        "Da de alta a alumnos y profesores y asigna su rol.",
        "people",
      ),
    );

  const groups: NavGroup[] = [
    {
      key: "before",
      step: 1,
      title: "Antes de la práctica",
      summary: "Prepara lo que se va a hacer y aparta el equipo.",
      items: before,
    },
    {
      key: "during",
      step: 2,
      title: "Durante la práctica",
      summary: "Asistencia, uso de máquinas y herramientas.",
      items: during,
    },
    {
      key: "after",
      step: 3,
      title: "Después de la práctica",
      summary: "Fallas, mantenimiento y reportes.",
      items: after,
    },
    {
      key: "laboratory",
      title: "El laboratorio",
      summary: "Lo que hay y quién participa.",
      items: laboratory,
    },
  ];
  return {
    home: {
      ...item("home", "", "Inicio", "Tu recorrido por la práctica.", "home"),
      exact: true,
    },
    // Number only the phases that remain, so a person never sees "1, 3".
    groups: groups
      .filter((group) => group.items.length > 0)
      .map((group, index, kept) =>
        group.step
          ? {
              ...group,
              step: kept.slice(0, index + 1).filter((g) => g.step).length,
            }
          : group,
      ),
  };
}

export const ACCOUNT_NAVIGATION: NavItem[] = [
  {
    key: "labs",
    href: "/app?choose",
    label: "Mis laboratorios",
    hint: "Cambia de laboratorio.",
    icon: "labs",
    exact: true,
  },
  {
    key: "notifications",
    href: "/app/notifications",
    label: "Notificaciones",
    hint: "Avisos sobre tus prácticas y reportes.",
    icon: "bell",
  },
  {
    key: "security",
    href: "/app/account/security",
    label: "Contraseña",
    hint: "Cambia tu contraseña.",
    icon: "lock",
  },
];
