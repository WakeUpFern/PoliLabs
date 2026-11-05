import { REPORT_LIST } from "@/modules/reports/domain/reports";

/**
 * Laboratory sections, in the order a practice happens: prepare it, reserve,
 * take attendance and use machines, follow up on failures. Sections are
 * grouped by intent (day to day, care of the laboratory, administration) and
 * the order inside each group is the guide. Every decision is made from
 * permissions, never role keys.
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
  icon: IconName;
  /** Active only on its own page, not on the pages below it. */
  exact?: boolean;
  group?: NavGroup;
  /** Shorter name for the phone's bottom bar, where space is tight. */
  short?: string;
  counter?: number;
};

export type NavGroup = "daily" | "care" | "admin";

export const NAV_GROUPS: readonly { key: NavGroup; label: string }[] = [
  { key: "daily", label: "Día a día" },
  { key: "care", label: "Cuidado del laboratorio" },
  { key: "admin", label: "Administración" },
];

const GROUP_OF: Record<string, NavGroup> = {
  academic: "daily",
  reservations: "daily",
  attendance: "daily",
  usage: "daily",
  loans: "daily",
  incidents: "care",
  maintenance: "care",
  inventory: "care",
  spaces: "care",
  reports: "admin",
  people: "admin",
};

const SHORT_LABEL: Record<string, string> = {
  reservations: "Reservas",
  maintenance: "Manten.",
  usage: "Uso",
};

export function labNavigation(
  slug: string,
  permissionKeys: readonly string[],
): NavItem[] {
  const can = (key: string) => permissionKeys.includes(key);
  const base = `/app/labs/${encodeURIComponent(slug)}`;
  const items: NavItem[] = [
    { key: "home", href: base, label: "Inicio", icon: "home", exact: true },
  ];
  const add = (key: string, path: string, label: string, icon: IconName) =>
    items.push({
      key,
      href: `${base}${path}`,
      label,
      icon,
      group: GROUP_OF[key],
      short: SHORT_LABEL[key],
    });

  if (can("academic.read"))
    add("academic", "/academic", "Prácticas", "practices");
  if (can("reservation.read"))
    add("reservations", "/reservations", "Reservaciones", "calendar");
  if (
    can("attendance.manage") ||
    can("attendance.checkin") ||
    can("attendance.read")
  )
    add("attendance", "/attendance", "Asistencia", "attendance");
  if (can("usage.record") || can("usage.trace") || can("usage.read"))
    add("usage", "/usage", "Uso de equipo", "machine");
  if (can("inventory.loan") || can("inventory.loan.read"))
    add("loans", "/loans", "Préstamos", "loans");
  if (can("incident.review"))
    add(
      "incidents",
      can("incident.read") ? "/incidents?scope=laboratory" : "/incidents",
      "Incidencias",
      "incident",
    );
  else if (can("incident.read"))
    add("incidents", "/incidents", "Incidencias", "incident");
  else if (can("incident.create"))
    add("incidents", "/incidents/new", "Incidencias", "incident");
  if (can("maintenance.read"))
    add("maintenance", "/maintenance", "Mantenimiento", "maintenance");
  if (can("inventory.read"))
    add("inventory", "/inventory", "Inventario", "inventory");
  if (can("space.read")) add("spaces", "/spaces", "Espacios", "spaces");
  if (REPORT_LIST.some((report) => can(report.permission)))
    add("reports", "/reports", "Reportes", "reports");
  if (can("laboratory.membership.manage"))
    add("people", "/people", "Personas", "people");
  return items;
}

/**
 * The phone's dock: Inicio plus the two sections this person uses most, with
 * the create button between them and "Más" closing the row (ADR 0025).
 * Managing stock marks whoever runs the laboratory, managing practices marks
 * a teacher, and everyone else works through practices and reservations.
 */
export function quickSections(
  sections: readonly NavItem[],
  permissionKeys: readonly string[],
): string[] {
  const can = (key: string) => permissionKeys.includes(key);
  const preferred = can("inventory.manage")
    ? ["incidents", "inventory"]
    : can("academic.manage")
      ? ["academic", "attendance"]
      : ["academic", "reservations"];
  const available = new Set(sections.map((item) => item.key));
  const picked = preferred.filter((key) => available.has(key));
  for (const item of sections) {
    if (picked.length >= 2) break;
    if (item.key !== "home" && !picked.includes(item.key))
      picked.push(item.key);
  }
  return available.has("home") ? ["home", ...picked] : picked;
}

export type CreateAction = NavItem & {
  /** One line on what the action starts, shown under its name. */
  hint: string;
  /** The section it belongs to; its actions come first while you are there. */
  section: string;
};

/**
 * What the create button offers: everything a person can start, in the order
 * their role reaches for it. A teacher starts with practices and sessions, a
 * student with reservations and attendance, whoever manages stock with the
 * inventory; the rest follows. Every entry is
 * decided from permissions, never role keys.
 */
export function createActions(
  slug: string,
  permissionKeys: readonly string[],
): CreateAction[] {
  const can = (key: string) => permissionKeys.includes(key);
  const base = `/app/labs/${encodeURIComponent(slug)}`;
  const actions: CreateAction[] = [];
  const add = (
    allowed: boolean,
    action: Omit<CreateAction, "href"> & { path: string },
  ) => {
    if (!allowed) return;
    const { path, ...rest } = action;
    actions.push({ ...rest, href: `${base}${path}` });
  };

  add(can("academic.manage"), {
    key: "new-practice",
    path: "/academic/practices/new",
    label: "Nueva práctica",
    hint: "Objetivo, instrucciones y material",
    icon: "practices",
    section: "academic",
  });
  add(can("academic.manage"), {
    key: "new-session",
    path: "/academic",
    label: "Programar sesión",
    hint: "Elige la práctica y el horario",
    icon: "attendance",
    section: "academic",
  });
  add(can("reservation.create"), {
    key: "new-reservation",
    path: "/reservations",
    label: "Reservar",
    hint: "Un espacio o una máquina en el calendario",
    icon: "calendar",
    section: "reservations",
  });
  add(can("attendance.checkin"), {
    key: "check-in",
    path: "/attendance",
    label: "Registrar asistencia",
    hint: "A la sesión que está abierta",
    icon: "attendance",
    section: "attendance",
  });
  add(can("usage.record"), {
    key: "start-usage",
    path: "/usage",
    label: "Usar una máquina",
    hint: "Registra el inicio de su uso",
    icon: "machine",
    section: "usage",
  });
  add(can("inventory.loan"), {
    key: "new-loan",
    path: "/inventory",
    label: "Prestar herramienta",
    hint: "Elígela en el inventario",
    icon: "loans",
    section: "loans",
  });
  add(can("inventory.manage"), {
    key: "new-item",
    path: "/inventory/new",
    label: "Nuevo artículo",
    hint: "Material, consumible o herramienta",
    icon: "inventory",
    section: "inventory",
  });
  add(can("maintenance.create"), {
    key: "new-maintenance",
    path: "/maintenance",
    label: "Registrar mantenimiento",
    hint: "Elige el equipo atendido",
    icon: "maintenance",
    section: "maintenance",
  });
  add(can("incident.create"), {
    key: "new-incident",
    path: "/incidents/new",
    label: "Reportar una falla",
    hint: "Equipo dañado o algo que no funciona",
    icon: "incident",
    section: "incidents",
  });
  add(can("laboratory.membership.manage"), {
    key: "new-person",
    path: "/people",
    label: "Agregar persona",
    hint: "Da de alta a un alumno o profesor",
    icon: "people",
    section: "people",
  });
  // Whoever runs the laboratory starts with stock and the care of equipment.
  if (can("inventory.manage")) {
    const first = ["new-item", "new-loan", "new-maintenance", "new-incident"];
    const rank = (action: CreateAction) => {
      const index = first.indexOf(action.key);
      return index === -1 ? first.length : index;
    };
    return actions
      .map((action, index) => ({ action, index }))
      .sort((a, b) => rank(a.action) - rank(b.action) || a.index - b.index)
      .map(({ action }) => action);
  }
  return actions;
}

/** The actions of the section you are in go first; the rest keep their order. */
export function actionsFor(
  actions: readonly CreateAction[],
  sectionKey: string | undefined,
): CreateAction[] {
  if (!sectionKey) return [...actions];
  return [
    ...actions.filter((action) => action.section === sectionKey),
    ...actions.filter((action) => action.section !== sectionKey),
  ];
}

export const ACCOUNT_NAVIGATION: NavItem[] = [
  {
    key: "labs",
    href: "/app?choose",
    label: "Mis laboratorios",
    icon: "labs",
    exact: true,
  },
  {
    key: "notifications",
    href: "/app/notifications",
    label: "Notificaciones",
    icon: "bell",
  },
  {
    key: "security",
    href: "/app/account/security",
    label: "Contraseña",
    icon: "lock",
  },
];
