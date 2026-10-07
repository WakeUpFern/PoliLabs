import {
  formatReportTime,
  reportDate,
  MAINTENANCE_HORIZON_DAYS,
  REPORT_TIME_ZONE,
  type ReportCell,
  type ReportColumn,
  type ReportKey,
} from "./reports";

// Rows as read from PostgreSQL; quantities are numeric(18,3) text.
export type StockRow = {
  itemName: string;
  itemType: string;
  unit: string;
  spaceName: string | null;
  locationName: string | null;
  stock: string;
  loaned: string;
  available: string;
};
export type MovementRow = {
  createdAt: Date;
  itemName: string;
  unit: string;
  type: string;
  quantity: string;
  quantityBefore: string;
  quantityAfter: string;
  actorName: string;
  source: string;
  notes: string;
};
export type LoanRow = {
  loanedAt: Date;
  itemName: string;
  borrowerName: string;
  quantity: string;
  outstanding: string;
  status: string;
  dueAt: Date | null;
  closedAt: Date | null;
  sessionLabel: string | null;
  actorName: string;
  returnedGood: string;
  returnedDamaged: string;
  returnedLost: string;
  notes: string | null;
};
export type MaintenanceRow = {
  performedAt: Date;
  spaceName: string;
  resourceName: string;
  type: string;
  statusBefore: string;
  statusAfter: string;
  performerName: string;
  nextDueOn: string | null;
  linkedIncident: boolean;
  materials: { itemName: string; quantity: string; unit: string }[];
  description: string;
};
export type IncidentRow = {
  createdAt: Date;
  targetKind: string;
  targetName: string;
  spaceName: string;
  severity: string;
  status: string;
  reporterName: string;
  resolvedAt: Date | null;
  resolution: string | null;
  description: string;
};
export type AttentionRow = {
  spaceName: string;
  resourceName: string;
  operationalStatus: string;
  lastPerformedAt: Date | null;
  lastType: string | null;
  nextDueOn: string | null;
};

const ITEM_TYPES: Record<string, string> = {
  consumable: "Consumible",
  reusable_tool: "Herramienta reutilizable",
};
const UNITS: Record<string, string> = {
  piece: "piezas",
  metre: "m",
  litre: "L",
  kilogram: "kg",
};
const MOVEMENTS: Record<string, string> = {
  initial: "Existencia inicial",
  purchase: "Compra",
  entry: "Entrada",
  consumption: "Consumo",
  damage: "Daño",
  loss: "Pérdida",
  adjustment_in: "Ajuste de entrada",
  adjustment_out: "Ajuste de salida",
};
const OPERATIONAL: Record<string, string> = {
  operational: "En operación",
  in_maintenance: "En mantenimiento",
  out_of_service: "Fuera de servicio",
};
const MAINTENANCE_TYPES: Record<string, string> = {
  preventive: "Preventivo",
  corrective: "Correctivo",
  inspection: "Inspección",
  other: "Otro",
};
const TARGETS: Record<string, string> = {
  resource: "Recurso",
  space: "Espacio",
  session: "Sesión",
};
const SEVERITIES: Record<string, string> = {
  low: "Baja",
  medium: "Media",
  high: "Alta",
};
const INCIDENT_STATUSES: Record<string, string> = {
  open: "Abierta",
  in_review: "En revisión",
  resolved: "Resuelta",
};
const label = (labels: Record<string, string>, value: string) =>
  labels[value] ?? value;

const TIME = `(${REPORT_TIME_ZONE})`;
const col = (
  header: string,
  kind: ReportColumn["kind"],
  width: number,
): ReportColumn => ({ header, kind, width });
const text = (header: string, width = 2) => col(header, "text", width);
const number = (header: string) => col(header, "number", 1.2);
const time = (header: string) => col(`${header} ${TIME}`, "time", 1.6);
const day = (header: string) => col(header, "date", 1.2);

type Projection<Row> = {
  columns: ReportColumn[];
  notes?: (now: Date) => string[];
  row: (row: Row, now: Date) => ReportCell[];
};

const stock: Projection<StockRow> = {
  columns: [
    text("Artículo", 3),
    text("Tipo", 1.8),
    text("Unidad", 1),
    text("Ubicación", 2.5),
    number("Existencia"),
    number("Prestado"),
    number("Disponible"),
  ],
  notes: () => [
    "Disponible = existencia - unidades pendientes de préstamos activos.",
  ],
  row: (r) => [
    r.itemName,
    label(ITEM_TYPES, r.itemType),
    label(UNITS, r.unit),
    r.locationName ? `${r.spaceName} › ${r.locationName}` : null,
    r.stock,
    r.loaned,
    r.available,
  ],
};
const movements: Projection<MovementRow> = {
  columns: [
    time("Fecha"),
    text("Artículo", 2.5),
    text("Movimiento", 1.6),
    number("Cantidad"),
    text("Unidad", 0.9),
    number("Antes"),
    number("Después"),
    text("Registró", 1.8),
    text("Origen", 0.9),
    text("Notas", 3),
  ],
  row: (r) => [
    formatReportTime(r.createdAt),
    r.itemName,
    label(MOVEMENTS, r.type),
    r.quantity,
    label(UNITS, r.unit),
    r.quantityBefore,
    r.quantityAfter,
    r.actorName,
    r.source,
    r.notes,
  ],
};
// Overdue is derived at generation time, as in Loans I.
function loanStatus(r: LoanRow, now: Date) {
  if (r.status === "returned") return "Devuelto";
  return r.dueAt && r.dueAt <= now ? "Vencido" : "Activo";
}
const loans: Projection<LoanRow> = {
  columns: [
    time("Prestado el"),
    text("Herramienta", 2.2),
    text("Prestatario", 2),
    number("Cantidad"),
    number("Pendiente"),
    text("Estado", 1),
    time("Compromiso"),
    time("Cerrado el"),
    number("Devuelto bien"),
    number("Con daño"),
    number("Perdido"),
    text("Sesión", 1.8),
    text("Registró", 1.8),
    text("Notas", 2.2),
  ],
  notes: (now) => [
    `Estado calculado al ${formatReportTime(now)} ${TIME}: vencido = activo con compromiso pasado.`,
  ],
  row: (r, now) => [
    formatReportTime(r.loanedAt),
    r.itemName,
    r.borrowerName,
    r.quantity,
    r.outstanding,
    loanStatus(r, now),
    formatReportTime(r.dueAt),
    formatReportTime(r.closedAt),
    r.returnedGood,
    r.returnedDamaged,
    r.returnedLost,
    r.sessionLabel,
    r.actorName,
    r.notes,
  ],
};
const maintenance: Projection<MaintenanceRow> = {
  columns: [
    text("Espacio", 1.6),
    text("Recurso", 2),
    time("Realizado"),
    text("Tipo", 1.2),
    text("Estado anterior", 1.4),
    text("Estado resultante", 1.4),
    text("Realizó", 1.8),
    day("Próximo mantenimiento"),
    text("Incidencia vinculada", 1),
    text("Materiales", 2.4),
    text("Descripción", 3),
  ],
  row: (r) => [
    r.spaceName,
    r.resourceName,
    formatReportTime(r.performedAt),
    label(MAINTENANCE_TYPES, r.type),
    label(OPERATIONAL, r.statusBefore),
    label(OPERATIONAL, r.statusAfter),
    r.performerName,
    r.nextDueOn,
    r.linkedIncident ? "Sí" : "No",
    r.materials.length
      ? r.materials
          .map((m) => `${m.itemName} ${m.quantity} ${label(UNITS, m.unit)}`)
          .join("; ")
      : null,
    r.description,
  ],
};
const incidents: Projection<IncidentRow> = {
  columns: [
    time("Reportada el"),
    text("Objetivo", 1),
    text("Nombre", 2),
    text("Espacio", 1.6),
    text("Severidad", 1),
    text("Estado", 1.1),
    text("Reportó", 1.8),
    time("Resuelta el"),
    text("Descripción", 3),
    text("Resolución", 2.6),
  ],
  notes: () => [
    "Nombre y espacio corresponden al contexto conservado al reportar.",
  ],
  row: (r) => [
    formatReportTime(r.createdAt),
    label(TARGETS, r.targetKind),
    r.targetName,
    r.spaceName,
    label(SEVERITIES, r.severity),
    label(INCIDENT_STATUSES, r.status),
    r.reporterName,
    formatReportTime(r.resolvedAt),
    r.description,
    r.resolution,
  ],
};
// `today` is the laboratory's local date at generation time.
export function attentionReason(r: AttentionRow, today: string) {
  const reasons: string[] = [];
  if (r.operationalStatus !== "operational")
    reasons.push(label(OPERATIONAL, r.operationalStatus));
  if (r.nextDueOn)
    reasons.push(
      r.nextDueOn < today ? "Mantenimiento vencido" : "Mantenimiento próximo",
    );
  return reasons.join("; ");
}
const attention: Projection<AttentionRow> = {
  columns: [
    text("Espacio", 1.8),
    text("Recurso", 2.2),
    text("Estado operativo", 1.5),
    time("Último mantenimiento"),
    text("Tipo", 1.2),
    day("Próximo mantenimiento"),
    text("Motivo", 2.4),
  ],
  notes: () => [
    `Incluye recursos activos no operativos o cuyo último mantenimiento prevé el siguiente en ${MAINTENANCE_HORIZON_DAYS} días o antes.`,
  ],
  row: (r, now) => [
    r.spaceName,
    r.resourceName,
    label(OPERATIONAL, r.operationalStatus),
    formatReportTime(r.lastPerformedAt),
    r.lastType ? label(MAINTENANCE_TYPES, r.lastType) : null,
    r.nextDueOn,
    attentionReason(r, reportDate(now)),
  ],
};

export type ReportRows = {
  "inventory-stock": StockRow;
  "inventory-movements": MovementRow;
  loans: LoanRow;
  maintenance: MaintenanceRow;
  incidents: IncidentRow;
  "resource-attention": AttentionRow;
};
export const PROJECTIONS: { [K in ReportKey]: Projection<ReportRows[K]> } = {
  "inventory-stock": stock,
  "inventory-movements": movements,
  loans,
  maintenance,
  incidents,
  "resource-attention": attention,
};
export function project<K extends ReportKey>(
  key: K,
  rows: ReportRows[K][],
  now: Date,
) {
  const projection = PROJECTIONS[key];
  return {
    columns: projection.columns,
    notes: projection.notes?.(now) ?? [],
    rows: rows.map((row) => projection.row(row, now)),
  };
}
