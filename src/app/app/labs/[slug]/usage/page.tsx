import Link from "next/link";
import { usageWeb } from "@/modules/usage/web/services";
import { formatAcademicTime } from "@/modules/academic/web/time";
import { UsageForm } from "./usage-form";
import { usagePageData } from "./page-data";
export default async function UsagePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { options, history } = await usagePageData(() => usageWeb.page(slug));
  return (
    <div>
      <Link href={`/app/labs/${slug}`}>← Laboratorio</Link>
      <h1 className="mt-6 text-3xl font-semibold">Uso de maquinaria</h1>
      <p className="mt-3 text-stone-600">
        Registra el uso efectivo. La asistencia y las reservaciones se conservan
        por separado.
      </p>
      <section className="mt-6 rounded-2xl border border-stone-200 bg-white p-6">
        <h2 className="mb-4 text-xl font-semibold">Iniciar uso</h2>
        {options.length ? (
          <UsageForm slug={slug} operation="start" label="Iniciar uso">
            <label className="block">
              Recurso y contexto
              <select
                required
                name="selection"
                defaultValue=""
                className="mt-2 block w-full rounded-xl border border-stone-300 p-3"
              >
                <option value="" disabled>
                  Selecciona un recurso y contexto
                </option>
                {options.map((o) => (
                  <option
                    key={`${o.kind}:${o.contextId}:${o.resourceId}`}
                    value={`${o.kind}:${o.contextId}:${o.resourceId}`}
                  >
                    {o.resourceName} ·{" "}
                    {o.kind === "academic" ? "Sesión" : "Reservación"}:{" "}
                    {o.title} · {formatAcademicTime(o.startsAt)}
                  </option>
                ))}
              </select>
            </label>
          </UsageForm>
        ) : (
          <p>
            No hay sesiones abiertas o reservaciones vigentes con recursos
            disponibles para tu cuenta.
          </p>
        )}
      </section>
      <section className="mt-6">
        <h2 className="text-xl font-semibold">Mis usos</h2>
        <div className="mt-4 space-y-4">
          {history.map((u) => (
            <article
              className="rounded-2xl border border-stone-200 bg-white p-6"
              key={u.id}
            >
              <p className="font-semibold">
                {u.endedAt ? "Uso terminado" : "Uso en curso"}
              </p>
              <p className="mt-2 break-all">Recurso: {u.resourceName}</p>
              <p className="mt-2 text-sm">
                Inicio: {formatAcademicTime(u.startedAt)} · Fin:{" "}
                {u.endedAt ? formatAcademicTime(u.endedAt) : "En curso"}
              </p>
              {u.sessionId ? (
                <Link
                  className="mt-2 inline-block text-[#7a1731]"
                  href={`/app/labs/${slug}/academic/sessions/${u.sessionId}`}
                >
                  Ver sesión
                </Link>
              ) : (
                <Link
                  className="mt-2 inline-block text-[#7a1731]"
                  href={`/app/labs/${slug}/reservations/${u.reservationId}`}
                >
                  Ver reservación
                </Link>
              )}
              {!u.endedAt ? (
                <div className="mt-4">
                  <UsageForm
                    slug={slug}
                    operation="finish"
                    label="Terminar uso"
                  >
                    <input type="hidden" name="usageId" value={u.id} />
                  </UsageForm>
                </div>
              ) : null}
            </article>
          ))}
          {!history.length ? <p>No has registrado uso de maquinaria.</p> : null}
        </div>
      </section>
    </div>
  );
}
