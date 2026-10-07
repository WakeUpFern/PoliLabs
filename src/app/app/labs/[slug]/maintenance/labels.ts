export const operationalStatusLabels = {
  operational: "En operación",
  in_maintenance: "En mantenimiento",
  out_of_service: "Fuera de servicio",
};
export const maintenanceTypeLabels = {
  preventive: "Preventivo",
  corrective: "Correctivo",
  inspection: "Inspección",
  other: "Otro",
};
export const unitLabels: Record<string, string> = {
  piece: "pieza(s)",
  metre: "m",
  litre: "L",
  kilogram: "kg",
};
export function statusTone(status: keyof typeof operationalStatusLabels) {
  return status === "operational"
    ? "bg-emerald-50 text-emerald-800"
    : status === "in_maintenance"
      ? "bg-amber-50 text-amber-800"
      : "bg-red-50 text-red-800";
}
export function formatDueDate(value: string) {
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: "UTC",
    dateStyle: "medium",
  }).format(new Date(`${value}T00:00:00Z`));
}
