import Link from "next/link";
import { ReportDownloads } from "../reports/report-downloads";
import { incidentsWeb } from "@/modules/incidents/web/services";
import { formatAcademicTime } from "@/modules/academic/web/time";
import { incidentPageData } from "./page-data";
import { statusLabels, severityLabels, targetLabels } from "./labels";
export default async function IncidentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ scope?: string }>;
}) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const scope = query.scope === "laboratory" ? "laboratory" : "own";
  const { access, entries } = await incidentPageData(() =>
    incidentsWeb.page(slug, scope),
  );
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold sm:text-3xl">Incidencias</h1>
        {access.canCreate ? (
          <Link
            className="btn btn-primary"
            href={`/app/labs/${slug}/incidents/new`}
          >
            Reportar incidencia
          </Link>
        ) : null}
      </div>
      {access.canReadOwn && access.canReview ? (
        <nav
          aria-label="Reportes"
          className="mt-4 flex gap-1 border-b border-line"
        >
          <Link
            href={`/app/labs/${slug}/incidents`}
            aria-current={scope === "own" ? "page" : undefined}
            className={`-mb-px border-b-2 px-4 py-2 font-semibold ${scope === "own" ? "border-guinda text-guinda" : "border-transparent text-muted"}`}
          >
            Mis reportes
          </Link>
          <Link
            href={`/app/labs/${slug}/incidents?scope=laboratory`}
            aria-current={scope === "laboratory" ? "page" : undefined}
            className={`-mb-px border-b-2 px-4 py-2 font-semibold ${scope === "laboratory" ? "border-guinda text-guinda" : "border-transparent text-muted"}`}
          >
            Reportes del laboratorio
          </Link>
        </nav>
      ) : null}
      <h2 className="sr-only">
        {scope === "own" ? "Mis reportes" : "Reportes del laboratorio"}
      </h2>
      {scope === "laboratory" ? (
        <ReportDownloads slug={slug} reports={["incidents"]} />
      ) : null}
      <div className="mt-4 space-y-4">
        {entries.map((i) => (
          <article
            key={i.id}
            className="rounded-md border border-line bg-surface p-6"
          >
            <Link
              className="font-semibold text-guinda"
              href={`/app/labs/${slug}/incidents/${i.id}?scope=${scope}`}
            >
              {targetLabels[i.targetKind]}: {i.targetSnapshot.name}
            </Link>
            <p className="mt-2">
              {statusLabels[i.status]} · Severidad{" "}
              {severityLabels[i.severity].toLowerCase()}
            </p>
            <p className="mt-2 whitespace-pre-wrap break-words">
              {i.description}
            </p>
            <p className="mt-2 text-sm text-muted">
              {i.reporterName} · {formatAcademicTime(i.createdAt)}
            </p>
          </article>
        ))}
        {!entries.length ? <p>No hay incidencias en esta consulta.</p> : null}
      </div>
    </div>
  );
}
