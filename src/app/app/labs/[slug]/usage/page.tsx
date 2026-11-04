import Link from "next/link";
import { incidentsWeb } from "@/modules/incidents/web/services";
import { usageWeb } from "@/modules/usage/web/services";
import { formatTime } from "@/shared/time";
import { UsageForm } from "./usage-form";
import { usagePageData } from "./page-data";
export default async function UsagePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [{ options, history }, incidentAccess] = await Promise.all([
    usagePageData(() => usageWeb.page(slug)),
    incidentsWeb.access(slug),
  ]);
  return (
    <div>
      <h1 className="text-2xl font-semibold">Uso de equipo</h1>
      <p className="mt-3 text-muted">
        Registra el uso efectivo. La asistencia y las reservaciones se conservan
        por separado.
      </p>
      <section className="mt-6 box p-6">
        <h2 className="mb-4 text-xl font-semibold">Iniciar uso</h2>
        {options.length ? (
          <UsageForm slug={slug} operation="start" label="Iniciar uso">
            <label className="block">
              Recurso y contexto
              <select
                required
                name="selection"
                defaultValue=""
                className="mt-2 block w-full rounded-md border border-line p-3"
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
                    {o.title} · {formatTime(o.startsAt)}
                  </option>
                ))}
              </select>
            </label>
          </UsageForm>
        ) : (
          <p className="text-muted">
            No hay sesiones abiertas o reservaciones vigentes con recursos
            disponibles para tu cuenta.
          </p>
        )}
      </section>
      <section className="mt-6">
        <h2 className="text-xl font-semibold">Mis usos</h2>
        <div className="mt-4 space-y-4">
          {history.map((u) => (
            <article className="box p-6" key={u.id}>
              <p className="font-semibold">
                {u.endedAt ? "Uso terminado" : "Uso en curso"}
              </p>
              <p className="mt-2 break-all">Recurso: {u.resourceName}</p>
              <p className="mt-2 text-sm">
                Inicio: {formatTime(u.startedAt)} · Fin:{" "}
                {u.endedAt ? formatTime(u.endedAt) : "En curso"}
              </p>
              {u.sessionId ? (
                <Link
                  className="mt-2 inline-block text-guinda"
                  href={`/app/labs/${slug}/academic/sessions/${u.sessionId}`}
                >
                  Ver sesión
                </Link>
              ) : (
                <Link
                  className="mt-2 inline-block text-guinda"
                  href={`/app/labs/${slug}/reservations/${u.reservationId}`}
                >
                  Ver reservación
                </Link>
              )}
              {incidentAccess.canCreate ? (
                <Link
                  className="mt-3 block font-semibold text-guinda"
                  href={`/app/labs/${slug}/incidents/new?target=resource:${u.resourceId}${!u.endedAt ? `&usage=${u.id}` : ""}`}
                >
                  Reportar problema
                </Link>
              ) : null}
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
