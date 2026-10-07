import Link from "next/link";
import { incidentsWeb } from "@/modules/incidents/web/services";
import { formatAcademicTime } from "@/modules/academic/web/time";
import { IncidentForm } from "../incident-form";
import { incidentPageData } from "../page-data";
import { statusLabels, severityLabels, targetLabels } from "../labels";
import type { IncidentUsage } from "@/modules/incidents/domain/incidents";
function UsageEntry({ usage, at }: { usage: IncidentUsage; at: Date }) {
  const openAtReport = !usage.endedAt || usage.endedAt > at;
  return (
    <div className="rounded-xl bg-stone-50 p-4">
      <p className="font-semibold">{usage.userName}</p>
      <p className="mt-1 text-sm">
        Inicio: {formatAcademicTime(usage.startedAt)} ·{" "}
        {openAtReport
          ? "Abierto al reportar"
          : `Fin: ${formatAcademicTime(usage.endedAt!)}`}
      </p>
      {openAtReport && usage.endedAt ? (
        <p className="mt-1 text-sm">
          Finalizó después del reporte: {formatAcademicTime(usage.endedAt)}
        </p>
      ) : null}
      <p className="mt-1 text-sm">
        Contexto: {usage.sessionId ? "Sesión académica" : "Reservación"}
      </p>
    </div>
  );
}
export default async function IncidentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; incidentId: string }>;
  searchParams: Promise<{ scope?: string }>;
}) {
  const [{ slug, incidentId }, query] = await Promise.all([
    params,
    searchParams,
  ]);
  const scope = query.scope === "laboratory" ? "laboratory" : "own";
  const {
    incident: i,
    events,
    relatedUsage,
    usages,
    access,
  } = await incidentPageData(() =>
    incidentsWeb.detail(slug, incidentId, scope),
  );
  const previous = usages?.filter((u) => u.id !== i.usageId).slice(0, 50);
  return (
    <div>
      <Link href={`/app/labs/${slug}/incidents?scope=${scope}`}>
        ← Incidencias
      </Link>
      <h1 className="mt-6 text-3xl font-semibold">
        {targetLabels[i.targetKind]}: {i.targetSnapshot.name}
      </h1>
      <section className="mt-6 space-y-3 rounded-2xl border border-stone-200 bg-white p-6">
        <p>
          {statusLabels[i.status]} · Severidad{" "}
          {severityLabels[i.severity].toLowerCase()}
        </p>
        <p className="whitespace-pre-wrap break-words">{i.description}</p>
        <p>
          Reportó: {i.reporterName} · {formatAcademicTime(i.createdAt)}
        </p>
        <p>Espacio al reportar: {i.targetSnapshot.spaceName}</p>
        <p>
          Ubicación asignada al reportar:{" "}
          {i.targetSnapshot.locationName ?? "Sin ubicación específica"}
        </p>
        <p className="text-sm text-stone-600">
          Este contexto se conserva aunque cambie el catálogo. La hora del
          reporte no demuestra cuándo comenzó el problema.
        </p>
        {i.resolution ? (
          <p className="whitespace-pre-wrap break-words">
            Resolución: {i.resolution} · {formatAcademicTime(i.resolvedAt!)}
          </p>
        ) : null}
      </section>
      <section className="mt-6">
        <h2 className="text-xl font-semibold">Uso asociado al reporte</h2>
        <div className="mt-3">
          {relatedUsage ? (
            <UsageEntry usage={relatedUsage} at={i.createdAt} />
          ) : (
            <p>Observado sin uso asociado.</p>
          )}
        </div>
      </section>
      {access.canResolve && i.status !== "resolved" ? (
        <section className="mt-6 rounded-2xl border border-stone-200 bg-white p-6">
          <h2 className="mb-4 text-xl font-semibold">Seguimiento</h2>
          <IncidentForm
            key={`${i.id}:${i.version}`}
            slug={slug}
            operation="transition"
            label={
              i.status === "open" ? "Pasar a revisión" : "Resolver incidencia"
            }
          >
            <input type="hidden" name="incidentId" value={i.id} />
            <input type="hidden" name="expectedVersion" value={i.version} />
            <input
              type="hidden"
              name="next"
              value={i.status === "open" ? "in_review" : "resolved"}
            />
            <label className="block">
              {i.status === "open" ? "Nota de revisión" : "Nota de resolución"}
              <textarea
                name="note"
                required
                maxLength={5000}
                rows={3}
                className="mt-2 block w-full rounded-xl border border-stone-300 p-3"
              />
            </label>
          </IncidentForm>
        </section>
      ) : null}
      <section className="mt-6">
        <h2 className="text-xl font-semibold">Historial de seguimiento</h2>
        <ol className="mt-3 space-y-3">
          {events.map((e) => (
            <li key={e.id} className="rounded-xl border border-stone-200 p-4">
              <p className="font-semibold">
                {e.action === "incident.reported"
                  ? "Reporte"
                  : e.action === "incident.in_review"
                    ? "Revisión"
                    : "Resolución"}{" "}
                · {e.actorName}
              </p>
              <p className="mt-1 whitespace-pre-wrap break-words">{e.note}</p>
              <p className="mt-1 text-sm text-stone-600">
                {formatAcademicTime(e.createdAt)} · {e.source}
              </p>
            </li>
          ))}
        </ol>
      </section>
      {i.resourceId ? (
        <section className="mt-6">
          <h2 className="text-xl font-semibold">
            Usos registrados antes del reporte
          </h2>
          <p className="mt-2 text-stone-600">
            Información de trazabilidad: no implica responsabilidad ni acredita
            quién causó el problema. Pueden existir usos simultáneos.
          </p>
          {previous ? (
            <div className="mt-3 space-y-3">
              {previous.map((u) => (
                <UsageEntry key={u.id} usage={u} at={i.createdAt} />
              ))}
              {!previous.length ? (
                <p>No hay otros usos previos registrados.</p>
              ) : null}
              {usages!.length > 50 ? (
                <p>
                  Se muestran hasta 50 usos recientes; existe más historial.
                </p>
              ) : null}
            </div>
          ) : (
            <p className="mt-3">
              La consulta de usos de otras personas requiere permisos de
              revisión y trazabilidad.
            </p>
          )}
        </section>
      ) : null}
    </div>
  );
}
