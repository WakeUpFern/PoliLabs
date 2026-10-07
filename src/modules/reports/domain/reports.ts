import type { PermissionKey } from "@/modules/identity/domain/access-catalog";

export type ReportContext = { actorUserId: string; laboratoryId: string };

// Exports display wall time of the initial laboratory; instants stay exact.
export const REPORT_TIME_ZONE = "America/Mexico_City";
// Larger exports must be narrowed instead of silently truncated.
export const MAX_REPORT_ROWS = 5000;
export const MAX_PERIOD_DAYS = 366;
// A resource is "next to maintenance" when its latest due date falls this soon.
export const MAINTENANCE_HORIZON_DAYS = 30;

export const REPORT_KEYS = [
  "inventory-stock",
  "inventory-movements",
  "loans",
  "maintenance",
  "incidents",
  "resource-attention",
] as const;
export type ReportKey = (typeof REPORT_KEYS)[number];
export const REPORT_FORMATS = ["csv", "pdf"] as const;
export type ReportFormat = (typeof REPORT_FORMATS)[number];

export type ReportDefinition = {
  key: ReportKey;
  title: string;
  description: string;
  permission: PermissionKey;
  period: boolean;
};

// Each report reuses the read permission of the data it exports (ADR 0018 D2).
export const REPORTS: Record<ReportKey, ReportDefinition> = {
  "inventory-stock": {
    key: "inventory-stock",
    title: "Stock actual de inventario",
    description:
      "Artículos activos con existencia, unidades prestadas y disponibles.",
    permission: "inventory.read",
    period: false,
  },
  "inventory-movements": {
    key: "inventory-movements",
    title: "Movimientos de inventario",
    description:
      "Entradas, consumos, daños, pérdidas y ajustes registrados en el periodo.",
    permission: "inventory.read",
    period: true,
  },
  loans: {
    key: "loans",
    title: "Préstamos y devoluciones",
    description:
      "Préstamos registrados en el periodo con su estado y devoluciones por condición.",
    permission: "inventory.loan",
    period: true,
  },
  maintenance: {
    key: "maintenance",
    title: "Mantenimiento por recurso",
    description:
      "Entradas de bitácora realizadas en el periodo, agrupadas por recurso, con materiales.",
    permission: "maintenance.read",
    period: true,
  },
  incidents: {
    key: "incidents",
    title: "Incidencias y seguimiento",
    description:
      "Incidencias reportadas en el periodo con severidad, estado y resolución.",
    permission: "incident.review",
    period: true,
  },
  "resource-attention": {
    key: "resource-attention",
    title: "Recursos fuera de servicio o próximos a mantenimiento",
    description: `Recursos activos no operativos o con mantenimiento previsto en los próximos ${MAINTENANCE_HORIZON_DAYS} días.`,
    permission: "maintenance.read",
    period: false,
  },
};
export const REPORT_LIST = REPORT_KEYS.map((key) => REPORTS[key]);

export type ReportErrorCode = "input" | "not-found" | "too-large";
export class ReportError extends Error {
  constructor(public readonly code: ReportErrorCode) {
    super(`Report rejected: ${code}`);
    this.name = "ReportError";
  }
}

export function reportKey(value: string): ReportKey {
  if (!REPORT_KEYS.includes(value as ReportKey))
    throw new ReportError("not-found");
  return value as ReportKey;
}
export function reportFormat(value: string | null | undefined): ReportFormat {
  if (!REPORT_FORMATS.includes(value as ReportFormat))
    throw new ReportError("input");
  return value as ReportFormat;
}
export function reportUuid(value: string) {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
    throw new ReportError("input");
  return value.toLowerCase();
}

// Half-open [from, to) between instants with an explicit offset.
export type ReportPeriod = { from: Date; to: Date };
function instant(value: string | null | undefined) {
  if (!value || !/(Z|[+-]\d{2}:\d{2})$/.test(value))
    throw new ReportError("input");
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new ReportError("input");
  return parsed;
}
export function reportPeriod(
  from: string | null | undefined,
  to: string | null | undefined,
): ReportPeriod {
  const period = { from: instant(from), to: instant(to) };
  const span = period.to.getTime() - period.from.getTime();
  // One extra hour tolerates a DST transition inside a full-year range.
  if (span <= 0 || span > (MAX_PERIOD_DAYS * 24 + 1) * 3600000)
    throw new ReportError("input");
  return period;
}

const partsFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: REPORT_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
function parts(value: Date) {
  return Object.fromEntries(
    partsFormatter.formatToParts(value).map((p) => [p.type, p.value]),
  );
}
// Sortable wall time; the column header names the time zone.
export function formatReportTime(value: Date | null) {
  if (!value) return null;
  const p = parts(value);
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}
export function reportDate(value: Date) {
  const p = parts(value);
  return `${p.year}-${p.month}-${p.day}`;
}
export function addDays(date: string, days: number) {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}
// Inclusive local dates covered by a half-open period.
export function describePeriod(period: ReportPeriod) {
  return `${reportDate(period.from)} a ${reportDate(new Date(period.to.getTime() - 1))} (${REPORT_TIME_ZONE})`;
}

export function assertWithinLimit<T>(rows: T[]) {
  if (rows.length > MAX_REPORT_ROWS) throw new ReportError("too-large");
  return rows;
}

export type ColumnKind = "text" | "number" | "time" | "date";
export type ReportColumn = {
  header: string;
  kind: ColumnKind;
  // Relative width for PDF layout.
  width: number;
};
export type ReportCell = string | null;
export type ReportTable = {
  key: ReportKey;
  title: string;
  laboratoryName: string;
  generatedAt: Date;
  generatedBy: string;
  period: string | null;
  notes: string[];
  columns: ReportColumn[];
  rows: ReportCell[][];
};

export function reportFileName(table: ReportTable, format: ReportFormat) {
  return `${table.key}-${reportDate(table.generatedAt)}.${format}`;
}
