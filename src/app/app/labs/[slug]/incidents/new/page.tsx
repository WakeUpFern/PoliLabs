import Link from "next/link";
import { incidentsWeb } from "@/modules/incidents/web/services";
import { formatAcademicTime } from "@/modules/academic/web/time";
import { incidentPageData } from "../page-data";
import { ReportForm } from "./report-form";
export default async function NewIncidentPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ target?: string; usage?: string }>;
}) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const options = await incidentPageData(() => incidentsWeb.options(slug));
  const initialTarget = options.targets.some(
    (t) => `${t.kind}:${t.id}` === query.target,
  )
    ? query.target!
    : "";
  const initialUsage = options.usages.some(
    (u) => u.id === query.usage && initialTarget === `resource:${u.resourceId}`,
  )
    ? query.usage!
    : "";
  return (
    <div>
      <Link href={`/app/labs/${slug}/incidents`}>← Incidencias</Link>
      <h1 className="mt-6 text-3xl font-semibold">Reportar incidencia</h1>
      <p className="mt-3 text-stone-600">
        El reporte quedará a tu nombre y con la hora de registro. Describe lo
        observado; no necesitas identificar a una persona responsable.
      </p>
      <section className="mt-6 rounded-2xl border border-stone-200 bg-white p-6">
        {options.targets.length ? (
          <ReportForm
            slug={slug}
            targets={options.targets}
            usages={options.usages.map((u) => ({
              id: u.id,
              resourceId: u.resourceId,
              resourceName: u.resourceName,
              label: `${u.resourceName} · inicio ${formatAcademicTime(u.startedAt)} · ${u.sessionId ? "sesión" : "reservación"}`,
            }))}
            initialTarget={initialTarget}
            initialUsage={initialUsage}
          />
        ) : (
          <p>
            No hay objetivos disponibles para tu cuenta en este laboratorio.
          </p>
        )}
      </section>
    </div>
  );
}
