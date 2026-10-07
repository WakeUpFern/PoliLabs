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
      <Link href={`/app/labs/${slug}`}>← Laboratorio</Link>
      <h1 className="mt-6 text-3xl font-semibold">Incidencias</h1>
      <div className="mt-4 flex flex-wrap gap-4">
        {access.canCreate ? (
          <Link
            className="font-semibold text-[#7a1731]"
            href={`/app/labs/${slug}/incidents/new`}
          >
            Reportar incidencia
          </Link>
        ) : null}
        {access.canReadOwn ? (
          <Link href={`/app/labs/${slug}/incidents`}>Mis reportes</Link>
        ) : null}
        {access.canReview ? (
          <Link href={`/app/labs/${slug}/incidents?scope=laboratory`}>
            Reportes del laboratorio
          </Link>
        ) : null}
      </div>
      <h2 className="mt-6 text-xl font-semibold">
        {scope === "own" ? "Mis reportes" : "Reportes del laboratorio"}
      </h2>
      {scope === "laboratory" ? (
        <ReportDownloads slug={slug} reports={["incidents"]} />
      ) : null}
      <div className="mt-4 space-y-4">
        {entries.map((i) => (
          <article
            key={i.id}
            className="rounded-2xl border border-stone-200 bg-white p-6"
          >
            <Link
              className="font-semibold text-[#7a1731]"
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
            <p className="mt-2 text-sm text-stone-600">
              {i.reporterName} · {formatAcademicTime(i.createdAt)}
            </p>
          </article>
        ))}
        {!entries.length ? <p>No hay incidencias en esta consulta.</p> : null}
      </div>
    </div>
  );
}
