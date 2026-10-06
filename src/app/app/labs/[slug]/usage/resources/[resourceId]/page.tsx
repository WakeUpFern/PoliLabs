import Link from "next/link";
import { usageWeb } from "@/modules/usage/web/services";
import { formatAcademicTime } from "@/modules/academic/web/time";
import { usagePageData } from "../../page-data";
export default async function ResourceUsageTrace({
  params,
}: {
  params: Promise<{ slug: string; resourceId: string }>;
}) {
  const { slug, resourceId } = await params;
  const history = await usagePageData(() => usageWeb.trace(slug, resourceId));
  return (
    <div>
      <Link href={`/app/labs/${slug}/spaces`}>← Espacios</Link>
      <h1 className="mt-6 text-3xl font-semibold">
        Historial de uso del recurso
      </h1>
      <p className="mt-3 text-stone-600">
        El historial es informativo; no determina culpabilidad ni
        responsabilidad disciplinaria.
      </p>
      <div className="mt-6 space-y-4">
        {history.map((u) => (
          <article
            key={u.id}
            className="rounded-2xl border border-stone-200 bg-white p-6"
          >
            <p className="break-all">
              {u.resourceName} · {u.userName}
            </p>
            <p className="mt-2">
              {formatAcademicTime(u.startedAt)} →{" "}
              {u.endedAt ? formatAcademicTime(u.endedAt) : "En curso"}
            </p>
            <p className="mt-2">
              {u.sessionId
                ? "Contexto: sesión académica"
                : "Contexto: reservación"}
            </p>
          </article>
        ))}
        {!history.length ? <p>Sin usos registrados.</p> : null}
      </div>
    </div>
  );
}
