import { REPORT_LIST } from "@/modules/reports/domain/reports";

/**
 * Laboratory sections, in the order a practice happens: prepare it, reserve,
 * take attendance and use machines, follow up on failures. The order itself
 * is the guide; nothing needs to be labelled. Every decision is made from
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
  counter?: number;
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
    items.push({ key, href: `${base}${path}`, label, icon });

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

/** What the "+" menu offers: the things a person starts most often. */
export function createActions(
  slug: string,
  permissionKeys: readonly string[],
): NavItem[] {
  const can = (key: string) => permissionKeys.includes(key);
  const base = `/app/labs/${encodeURIComponent(slug)}`;
  const actions: NavItem[] = [];
  if (can("academic.manage"))
    actions.push({
      key: "new-practice",
      href: `${base}/academic/practices/new`,
      label: "Nueva práctica",
      icon: "practices",
    });
  if (can("reservation.create"))
    actions.push({
      key: "new-reservation",
      href: `${base}/reservations`,
      label: "Nueva reservación",
      icon: "calendar",
    });
  if (can("incident.create"))
    actions.push({
      key: "new-incident",
      href: `${base}/incidents/new`,
      label: "Reportar una falla",
      icon: "incident",
    });
  if (can("laboratory.membership.manage"))
    actions.push({
      key: "new-person",
      href: `${base}/people`,
      label: "Agregar persona",
      icon: "people",
    });
  return actions;
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
