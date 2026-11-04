import Link from "next/link";
import { ReportDownloads } from "../reports/report-downloads";
import { maintenanceWeb } from "@/modules/maintenance/web/services";
import { formatTime } from "@/shared/time";
import { maintenancePageData } from "./page-data";
import { formatDueDate, operationalStatusLabels, statusTone } from "./labels";
export default async function MaintenancePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { resources } = await maintenancePageData(() =>
    maintenanceWeb.page(slug),
  );
  return (
    <div>
      <h1 className="text-2xl font-semibold">Mantenimiento</h1>
      <p className="mt-3 text-muted">
        Estado operativo y bitácora de los recursos activos. Un recurso en
        mantenimiento o fuera de servicio no se ofrece para nuevas reservaciones
        ni usos.
      </p>
      <ReportDownloads
        slug={slug}
        reports={["resource-attention", "maintenance"]}
      />
      <div className="mt-6 space-y-4">
        {resources.map((r) => (
          <article key={r.id} className="box p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <Link
                className="font-semibold break-words text-guinda"
                href={`/app/labs/${slug}/maintenance/resources/${r.id}`}
              >
                {r.name}
              </Link>
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${statusTone(r.operationalStatus)}`}
              >
                {operationalStatusLabels[r.operationalStatus]}
              </span>
            </div>
            <p className="mt-2 text-sm text-muted">{r.spaceName}</p>
            <p className="mt-2 text-sm">
              {r.lastPerformedAt
                ? `Último mantenimiento: ${formatTime(r.lastPerformedAt)}`
                : "Sin mantenimiento registrado"}
              {r.nextDueOn ? ` · Próximo: ${formatDueDate(r.nextDueOn)}` : null}
            </p>
          </article>
        ))}
        {!resources.length ? <p>No hay recursos activos.</p> : null}
      </div>
    </div>
  );
}
