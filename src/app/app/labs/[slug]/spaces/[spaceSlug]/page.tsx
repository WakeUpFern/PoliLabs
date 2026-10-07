import Link from "next/link";
import { incidentsWeb } from "@/modules/incidents/web/services";
import { maintenanceWeb } from "@/modules/maintenance/web/services";
import { documentsWeb } from "@/modules/documents/web/services";
import { operationalStatusLabels, statusTone } from "../../maintenance/labels";
import { notFound } from "next/navigation";
import { requireCurrentActor } from "@/app/_lib/current-actor";
import { AuthorizationDeniedError } from "@/modules/identity/domain/access-errors";
import { getLaboratoryBySlug } from "@/modules/identity/infrastructure/services";
import type { LocationDetails } from "@/modules/spatial/domain/location";
import { SpaceNotFoundError } from "@/modules/spatial/domain/space";
import {
  getSpace,
  listLocations,
  listResources,
} from "@/modules/spatial/infrastructure/services";
import {
  createLocationAction,
  createResourceAction,
  deactivateLocationAction,
  deactivateResourceAction,
  updateLocationAction,
  updateResourceAction,
} from "./actions";
import { DeactivateOrganizationButton } from "./deactivate-organization-button";
import { LocationForm } from "./location-form";
import { ResourceForm } from "./resource-form";

type Props = { params: Promise<{ slug: string; spaceSlug: string }> };

function locationPath(
  location: LocationDetails,
  byId: ReadonlyMap<string, LocationDetails>,
) {
  const names = [location.name];
  const visited = new Set([location.id]);
  let parentId = location.parentId;
  while (parentId && !visited.has(parentId)) {
    visited.add(parentId);
    const parent = byId.get(parentId);
    if (!parent) break;
    names.unshift(parent.name);
    parentId = parent.parentId;
  }
  return names.join(" › ");
}

export default async function SpaceOrganizationPage({ params }: Props) {
  const [{ slug, spaceSlug }, { actorUserId }] = await Promise.all([
    params,
    requireCurrentActor(),
  ]);

  let laboratory;
  let space;
  let locationCatalog;
  let resourceCatalog;
  try {
    laboratory = await getLaboratoryBySlug.execute({
      actorUserId,
      laboratorySlug: slug,
    });
    space = await getSpace.execute({
      actorUserId,
      laboratoryId: laboratory.id,
      slug: spaceSlug,
    });
    [locationCatalog, resourceCatalog] = await Promise.all([
      listLocations.execute({
        actorUserId,
        laboratoryId: laboratory.id,
        spaceId: space.id,
      }),
      listResources.execute({
        actorUserId,
        laboratoryId: laboratory.id,
        spaceId: space.id,
      }),
    ]);
  } catch (error) {
    if (
      error instanceof AuthorizationDeniedError ||
      error instanceof SpaceNotFoundError
    )
      notFound();
    throw error;
  }

  const [incidentAccess, maintenanceAccess, documentAccess] = await Promise.all(
    [
      incidentsWeb.access(slug),
      maintenanceWeb.access(slug),
      documentsWeb.access(slug),
    ],
  );
  const locationsById = new Map(
    locationCatalog.locations.map((location) => [location.id, location]),
  );
  const sortedLocations = [...locationCatalog.locations].sort((left, right) =>
    locationPath(left, locationsById).localeCompare(
      locationPath(right, locationsById),
      "es",
    ),
  );
  const createLocation = createLocationAction.bind(null, slug, spaceSlug);
  const createResource = createResourceAction.bind(null, slug, spaceSlug);

  return (
    <div>
      <Link
        href={`/app/labs/${slug}/spaces`}
        className="text-sm font-semibold text-stone-600 transition hover:text-[#7a1731]"
      >
        <span aria-hidden="true">←</span> Espacios
      </Link>

      {incidentAccess.canCreate ? (
        <Link
          className="mt-4 block font-semibold text-[#7a1731]"
          href={`/app/labs/${slug}/incidents/new?target=space:${space.id}`}
        >
          Reportar problema del espacio
        </Link>
      ) : null}
      <header className="mt-6 rounded-3xl bg-[#641229] p-7 text-white shadow-lg shadow-[#641229]/10 sm:p-10">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#e2c68f]">
          Spatial II · {laboratory.name}
        </p>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-5xl">
          {space.name}
        </h1>
        <p className="mt-4 text-white/72">
          {space.capacity
            ? `Capacidad: ${space.capacity} personas`
            : "Capacidad no especificada"}
        </p>
      </header>

      <div className="mt-8 grid gap-8 xl:grid-cols-2">
        <section>
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="text-2xl font-semibold">Ubicaciones</h2>
              <p className="mt-2 text-sm leading-6 text-stone-600">
                Organización jerárquica dentro del espacio.
              </p>
            </div>
            <span className="text-sm text-stone-500">
              {sortedLocations.length} activas
            </span>
          </div>

          {locationCatalog.canManage ? (
            <div className="mt-5 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
              <h3 className="font-semibold">Nueva ubicación</h3>
              <LocationForm
                action={createLocation}
                locations={sortedLocations}
                submitLabel="Crear ubicación"
                formId="create-location"
              />
            </div>
          ) : null}

          <div className="mt-5 space-y-3">
            {sortedLocations.length === 0 ? (
              <EmptyState text="Todavía no hay ubicaciones activas." />
            ) : (
              sortedLocations.map((location) => {
                const updateAction = updateLocationAction.bind(
                  null,
                  slug,
                  spaceSlug,
                  location.id,
                );
                const deactivateAction = deactivateLocationAction.bind(
                  null,
                  slug,
                  spaceSlug,
                  location.id,
                );
                return (
                  <article
                    key={location.id}
                    className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm"
                  >
                    <p className="font-semibold">{location.name}</p>
                    <p className="mt-1 text-xs text-stone-500">
                      {locationPath(location, locationsById)}
                    </p>
                    <Link
                      className="mt-3 inline-block text-sm font-semibold text-[#7a1731]"
                      href={`/check-in/${slug}/${location.id}`}
                    >
                      Enlace estable de asistencia
                    </Link>
                    {locationCatalog.canManage ? (
                      <div className="mt-4 border-t border-stone-100 pt-4">
                        <details>
                          <summary className="cursor-pointer text-sm font-semibold text-[#7a1731]">
                            Editar ubicación
                          </summary>
                          <LocationForm
                            action={updateAction}
                            locations={sortedLocations}
                            submitLabel="Guardar ubicación"
                            formId={`location-${location.id}`}
                            location={location}
                          />
                        </details>
                        <div className="mt-4">
                          <DeactivateOrganizationButton
                            action={deactivateAction}
                            label="Desactivar ubicación"
                          />
                        </div>
                      </div>
                    ) : null}
                  </article>
                );
              })
            )}
          </div>
        </section>

        <section>
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="text-2xl font-semibold">Recursos</h2>
              <p className="mt-2 text-sm leading-6 text-stone-600">
                Recursos físicos individuales de este espacio.
              </p>
            </div>
            <span className="text-sm text-stone-500">
              {resourceCatalog.resources.length} activos
            </span>
          </div>

          {resourceCatalog.canManage ? (
            <div className="mt-5 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
              <h3 className="font-semibold">Nuevo recurso</h3>
              <ResourceForm
                action={createResource}
                locations={sortedLocations}
                submitLabel="Crear recurso"
                formId="create-resource"
              />
            </div>
          ) : null}

          <div className="mt-5 space-y-3">
            {resourceCatalog.resources.length === 0 ? (
              <EmptyState text="Todavía no hay recursos activos." />
            ) : (
              resourceCatalog.resources.map((resource) => {
                const updateAction = updateResourceAction.bind(
                  null,
                  slug,
                  spaceSlug,
                  resource.id,
                );
                const deactivateAction = deactivateResourceAction.bind(
                  null,
                  slug,
                  spaceSlug,
                  resource.id,
                );
                const location = resource.locationId
                  ? locationsById.get(resource.locationId)
                  : null;
                return (
                  <article
                    key={resource.id}
                    className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-semibold">{resource.name}</p>
                        {resource.operationalStatus !== "operational" ? (
                          <span
                            className={`mt-1 inline-block rounded-full px-3 py-1 text-xs font-semibold ${statusTone(resource.operationalStatus)}`}
                          >
                            {
                              operationalStatusLabels[
                                resource.operationalStatus
                              ]
                            }
                          </span>
                        ) : null}
                      </div>
                      <span className="rounded-full bg-stone-100 px-3 py-1 text-xs text-stone-600">
                        {location ? location.name : "Sin ubicación específica"}
                      </span>
                    </div>
                    {incidentAccess.canCreate ? (
                      <Link
                        className="mt-3 inline-block text-sm font-semibold text-[#7a1731]"
                        href={`/app/labs/${slug}/incidents/new?target=resource:${resource.id}`}
                      >
                        Reportar problema
                      </Link>
                    ) : null}
                    {maintenanceAccess.canRead ? (
                      <Link
                        className="mt-3 ml-4 inline-block text-sm font-semibold text-[#7a1731]"
                        href={`/app/labs/${slug}/maintenance/resources/${resource.id}`}
                      >
                        Mantenimiento
                      </Link>
                    ) : null}
                    {documentAccess.canRead ? (
                      <Link
                        className="mt-3 ml-4 inline-block text-sm font-semibold text-[#7a1731]"
                        href={`/app/labs/${slug}/resources/${resource.id}/documents`}
                      >
                        Documentos
                      </Link>
                    ) : null}
                    {resourceCatalog.canManage ? (
                      <Link
                        className="mt-3 inline-block text-sm font-semibold text-[#7a1731]"
                        href={`/app/labs/${slug}/usage/resources/${resource.id}`}
                      >
                        Historial de uso
                      </Link>
                    ) : null}
                    {resourceCatalog.canManage ? (
                      <div className="mt-4 border-t border-stone-100 pt-4">
                        <details>
                          <summary className="cursor-pointer text-sm font-semibold text-[#7a1731]">
                            Editar recurso
                          </summary>
                          <ResourceForm
                            action={updateAction}
                            locations={sortedLocations}
                            submitLabel="Guardar recurso"
                            formId={`resource-${resource.id}`}
                            resource={resource}
                          />
                        </details>
                        <div className="mt-4">
                          <DeactivateOrganizationButton
                            action={deactivateAction}
                            label="Desactivar recurso"
                          />
                        </div>
                      </div>
                    ) : null}
                  </article>
                );
              })
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 p-8 text-center text-stone-600">
      {text}
    </div>
  );
}
