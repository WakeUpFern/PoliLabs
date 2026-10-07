import Link from "next/link";
import { maintenanceWeb } from "@/modules/maintenance/web/services";
import {
  formatAcademicTime,
  instantToLocal,
} from "@/modules/academic/web/time";
import { maintenancePageData } from "../../page-data";
import {
  formatDueDate,
  maintenanceTypeLabels,
  operationalStatusLabels,
  statusTone,
  unitLabels,
} from "../../labels";
import { statusLabels as incidentStatusLabels } from "../../../incidents/labels";
import { MaintenanceForm } from "./maintenance-form";
import { documentsWeb } from "@/modules/documents/web/services";
import { DocumentList } from "../../../documents/document-list";
import { UploadForm } from "../../../documents/upload-form";
export default async function MaintenanceResourcePage({
  params,
}: {
  params: Promise<{ slug: string; resourceId: string }>;
}) {
  const { slug, resourceId } = await params;
  const { resource, logs, impact, access, options } = await maintenancePageData(
    () => maintenanceWeb.detail(slug, resourceId),
  );
  const { access: documents, evidence } = await maintenancePageData(() =>
    documentsWeb.evidence(slug, resourceId),
  );
  const unavailable = resource.operationalStatus !== "operational";
  return (
    <div>
      <Link href={`/app/labs/${slug}/maintenance`}>← Mantenimiento</Link>
      <h1 className="mt-6 text-3xl font-semibold break-words">
        {resource.name}
      </h1>
      <p className="mt-2 text-stone-600">{resource.spaceName}</p>
      {documents.canRead ? (
        <Link
          className="mt-2 inline-block text-sm font-semibold text-[#7a1731]"
          href={`/app/labs/${slug}/resources/${resource.id}/documents`}
        >
          Manuales y documentos
        </Link>
      ) : null}
      <section className="mt-6 space-y-3 rounded-2xl border border-stone-200 bg-white p-6">
        <span
          className={`inline-block rounded-full px-3 py-1 text-sm font-semibold ${statusTone(resource.operationalStatus)}`}
        >
          {operationalStatusLabels[resource.operationalStatus]}
        </span>
        {resource.nextDueOn ? (
          <p>Próximo mantenimiento: {formatDueDate(resource.nextDueOn)}</p>
        ) : null}
        {unavailable ? (
          <p>
            No se aceptan nuevas reservaciones de este recurso ni nuevos usos.
          </p>
        ) : null}
        {unavailable && (impact.openUsages || impact.futureReservations) ? (
          <p role="note" className="rounded-xl bg-amber-50 p-4 text-amber-900">
            Siguen vigentes {impact.openUsages} uso(s) abierto(s) y{" "}
            {impact.futureReservations} reservación(es) futura(s) que incluyen
            este recurso. No se cancelan ni cierran automáticamente; el personal
            autorizado decide cómo atenderlos.
          </p>
        ) : null}
      </section>
      {access.canCreate && options ? (
        <section className="mt-6 rounded-2xl border border-stone-200 bg-white p-6">
          <h2 className="mb-4 text-xl font-semibold">
            Registrar mantenimiento
          </h2>
          <p className="mb-4 text-sm text-stone-600">
            La entrada quedará a tu nombre. Las entradas no se editan: para
            corregir, registra otra.
          </p>
          <MaintenanceForm
            slug={slug}
            resourceId={resource.id}
            currentStatus={resource.operationalStatus}
            defaultPerformedLocal={instantToLocal(new Date())}
            incidents={options.incidents.map((i) => ({
              id: i.id,
              label: `${i.name} · ${incidentStatusLabels[i.status]} · ${formatAcademicTime(i.createdAt)}`,
            }))}
            items={access.canConsume ? options.items : null}
          />
        </section>
      ) : null}
      <h2 className="mt-8 text-xl font-semibold">Bitácora</h2>
      <div className="mt-4 space-y-4">
        {logs.map((log) => (
          <article
            key={log.id}
            className="rounded-2xl border border-stone-200 bg-white p-6"
          >
            <p className="font-semibold">
              {maintenanceTypeLabels[log.type]} ·{" "}
              {formatAcademicTime(log.performedAt)}
            </p>
            <p className="mt-1 text-sm">
              {operationalStatusLabels[log.statusBefore]} →{" "}
              {operationalStatusLabels[log.statusAfter]}
            </p>
            <p className="mt-2 break-words whitespace-pre-wrap">
              {log.description}
            </p>
            {log.materials.length ? (
              <ul className="mt-2 list-inside list-disc text-sm">
                {log.materials.map((m) => (
                  <li key={m.movementId}>
                    {m.itemName}: {m.quantity} {unitLabels[m.unit] ?? m.unit}
                  </li>
                ))}
              </ul>
            ) : null}
            {log.incidentId ? (
              <Link
                className="mt-2 inline-block text-sm font-semibold text-[#7a1731]"
                href={`/app/labs/${slug}/incidents/${log.incidentId}?scope=laboratory`}
              >
                Ver incidencia relacionada
              </Link>
            ) : null}
            <div className="mt-4 border-t border-stone-100 pt-4">
              <h3 className="mb-2 font-semibold">Evidencia</h3>
              <DocumentList
                slug={slug}
                documents={evidence.get(log.id) ?? []}
                canArchive={documents.canArchive}
                empty="Sin evidencia adjunta."
              />
              {documents.canAddEvidence ? (
                <details className="mt-3">
                  <summary className="cursor-pointer text-sm font-semibold text-[#7a1731]">
                    Añadir evidencia
                  </summary>
                  <p className="mt-2 text-sm text-stone-600">
                    La entrada no se modifica; la evidencia queda registrada a
                    tu nombre.
                  </p>
                  <div className="mt-2">
                    <UploadForm
                      slug={slug}
                      targetKind="maintenance-log"
                      targetId={log.id}
                      withTitle={false}
                      label="Foto o documento"
                    />
                  </div>
                </details>
              ) : null}
            </div>
            <p className="mt-2 text-sm text-stone-600">
              {log.performerName} · registrado{" "}
              {formatAcademicTime(log.createdAt)}
              {log.nextDueOn
                ? ` · próximo: ${formatDueDate(log.nextDueOn)}`
                : null}
            </p>
          </article>
        ))}
        {!logs.length ? <p>Sin entradas de mantenimiento.</p> : null}
      </div>
    </div>
  );
}
