import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCurrentActor } from "@/app/_lib/current-actor";
import { AuthorizationDeniedError } from "@/modules/identity/domain/access-errors";
import { getLaboratoryBySlug } from "@/modules/identity/infrastructure/services";
import { ReservationInputError } from "@/modules/reservations/domain/reservation";
import {
  formatCalendarTime,
  nextHourInterval,
} from "@/modules/reservations/web/calendar";
import { reservationWeb } from "@/modules/reservations/web/services";
import { formatReservationTime } from "@/modules/reservations/web/time";
import { FloorPlanError } from "@/modules/spatial/domain/floor-plan";
import { SpaceNotFoundError } from "@/modules/spatial/domain/space";
import {
  floorPlans,
  getSpace,
  listLocations,
  listResources,
} from "@/modules/spatial/infrastructure/services";
import {
  addFloorPlanElementAction,
  deactivateFloorPlanAction,
  moveFloorPlanElementAction,
  removeFloorPlanElementAction,
  updateFloorPlanAction,
} from "../actions";
import {
  FloorPlanCanvas,
  occupancyLabels,
  type CanvasElement,
} from "../floor-plan-canvas";
import {
  ActionForm,
  BoxFields,
  ElementForm,
  NumberField,
  TextField,
} from "../plan-forms";

type Props = {
  params: Promise<{ slug: string; spaceSlug: string; planId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const LOCAL = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const statusTone = {
  free: "bg-emerald-100 text-emerald-900",
  occupied: "bg-[#7a1731]/15 text-[#641229]",
  blocked: "bg-amber-100 text-amber-900",
};

async function optional<T>(load: () => Promise<T>, fallback: T) {
  try {
    return await load();
  } catch (error) {
    if (error instanceof AuthorizationDeniedError) return fallback;
    throw error;
  }
}

export default async function FloorPlanPage({ params, searchParams }: Props) {
  const [{ slug, spaceSlug, planId }, query, { actorUserId }] =
    await Promise.all([params, searchParams, requireCurrentActor()]);

  let laboratory;
  let space;
  let data;
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
    data = await floorPlans.get({
      actorUserId,
      laboratoryId: laboratory.id,
      floorPlanId: planId,
    });
  } catch (error) {
    if (
      error instanceof AuthorizationDeniedError ||
      error instanceof SpaceNotFoundError ||
      error instanceof FloorPlanError
    )
      notFound();
    throw error;
  }
  if (data.plan.spaceId !== space.id) notFound();

  const scope = { actorUserId, laboratoryId: laboratory.id, spaceId: space.id };
  const [resources, locations] = await Promise.all([
    optional(async () => (await listResources.execute(scope)).resources, []),
    optional(async () => (await listLocations.execute(scope)).locations, []),
  ]);

  const defaults = nextHourInterval(new Date());
  const interval = {
    startsLocal:
      typeof query.start === "string" && LOCAL.test(query.start)
        ? query.start
        : defaults.startsLocal,
    endsLocal:
      typeof query.end === "string" && LOCAL.test(query.end)
        ? query.end
        : defaults.endsLocal,
  };
  let occupancy = null;
  let intervalError = false;
  try {
    occupancy = await reservationWeb.occupancy(slug, space.id, interval);
  } catch (error) {
    if (!(error instanceof ReservationInputError)) throw error;
    intervalError = true;
  }

  const reserveHref = (resourceId: string) =>
    `/app/labs/${slug}/reservations/new?${new URLSearchParams({
      space: space.id,
      resource: resourceId,
      start: interval.startsLocal,
      end: interval.endsLocal,
    })}`;
  const elements: CanvasElement[] = data.elements.map((element) => {
    if (element.kind === "label") return { ...element, name: element.label };
    if (element.kind === "location")
      return {
        ...element,
        name:
          locations.find((location) => location.id === element.locationId)
            ?.name ?? "Ubicación",
      };
    const status = occupancy?.resources[element.resourceId];
    return {
      ...element,
      name:
        resources.find((resource) => resource.id === element.resourceId)
          ?.name ?? "Recurso",
      status,
      href:
        status === "free" && occupancy?.canCreate
          ? reserveHref(element.resourceId)
          : undefined,
    };
  });
  const placedResources = elements.filter((e) => e.kind === "resource");
  const spacePath = `/app/labs/${slug}/spaces/${spaceSlug}`;

  return (
    <div>
      <Link
        href={spacePath}
        className="text-sm font-semibold text-stone-600 transition hover:text-[#7a1731]"
      >
        <span aria-hidden="true">←</span> {space.name}
      </Link>
      <header className="mt-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#7a1731]">
            Plano · {space.name}
          </p>
          <h1 className="mt-2 text-3xl font-semibold">{data.plan.name}</h1>
          <p className="mt-2 text-sm text-stone-600">
            {data.plan.width} × {data.plan.height} celdas
          </p>
        </div>
        {occupancy ? (
          <Link
            href={`/app/labs/${slug}/reservations/calendar?space=${space.id}`}
            className="rounded-xl border border-[#7a1731] px-4 py-2 text-sm font-semibold text-[#7a1731]"
          >
            Ver calendario del espacio
          </Link>
        ) : null}
      </header>

      {occupancy !== null || intervalError ? (
        <form
          method="get"
          className="mt-6 grid gap-4 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:grid-cols-[1fr_1fr_auto] sm:items-end"
        >
          <div>
            <label htmlFor="start" className="mb-2 block font-semibold">
              Desde
            </label>
            <input
              id="start"
              name="start"
              type="datetime-local"
              required
              defaultValue={interval.startsLocal}
              className="min-h-11 w-full rounded-xl border border-stone-300 px-3"
            />
          </div>
          <div>
            <label htmlFor="end" className="mb-2 block font-semibold">
              Hasta
            </label>
            <input
              id="end"
              name="end"
              type="datetime-local"
              required
              defaultValue={interval.endsLocal}
              className="min-h-11 w-full rounded-xl border border-stone-300 px-3"
            />
          </div>
          <button
            type="submit"
            className="min-h-11 rounded-xl bg-[#7a1731] px-5 font-semibold text-white"
          >
            Ver ocupación
          </button>
          <p className="text-sm text-stone-600 sm:col-span-3">
            {intervalError
              ? "Revisa el intervalo: el fin debe ser posterior al inicio, sin superar 42 días, en hora válida de America/Mexico_City."
              : occupancy
                ? `Ocupación de ${formatReservationTime(occupancy.startsAt)} a ${formatReservationTime(occupancy.endsAt)}. ${occupancy.canCreate ? "Selecciona un recurso libre para reservarlo." : ""}`
                : null}
          </p>
        </form>
      ) : (
        <p className="mt-6 text-sm text-stone-600">
          Necesitas permiso para consultar reservaciones para ver la ocupación.
        </p>
      )}

      <div className="mt-6">
        {data.elements.length === 0 ? (
          <p className="mb-3 rounded-2xl border border-dashed border-stone-300 bg-stone-50 p-4 text-sm text-stone-600">
            El plano todavía no tiene elementos.
            {data.canManage
              ? " Coloca recursos, ubicaciones o etiquetas abajo."
              : ""}
          </p>
        ) : null}
        <FloorPlanCanvas
          name={data.plan.name}
          width={data.plan.width}
          height={data.plan.height}
          elements={elements}
        />
        <p className="mt-3 flex flex-wrap gap-4 text-sm text-stone-600">
          {(["free", "occupied", "blocked"] as const).map((status) => (
            <span key={status} className="inline-flex items-center gap-2">
              <span className={`h-3 w-3 rounded-sm ${statusTone[status]}`} />
              {occupancyLabels[status]}
            </span>
          ))}
          <span className="inline-flex items-center gap-2">
            <span className="h-3 w-3 rounded-sm border border-dashed border-sky-600 bg-sky-50" />
            Ubicación
          </span>
        </p>
      </div>

      {placedResources.length > 0 && (
        <section className="mt-8">
          <h2 id="placed-resources" className="text-xl font-semibold">
            Recursos en el plano
          </h2>
          <ul
            aria-labelledby="placed-resources"
            className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
          >
            {placedResources.map((resource) => (
              <li
                key={resource.id}
                className="flex items-center justify-between gap-3 rounded-2xl border border-stone-200 bg-white p-4"
              >
                <span className="font-semibold">{resource.name}</span>
                <span className="flex items-center gap-3">
                  {resource.status ? (
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${statusTone[resource.status]}`}
                    >
                      {occupancyLabels[resource.status]}
                    </span>
                  ) : null}
                  {resource.href ? (
                    <Link
                      href={resource.href}
                      className="text-sm font-semibold text-[#7a1731]"
                      aria-label={`Reservar ${resource.name}`}
                    >
                      Reservar
                    </Link>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {occupancy && occupancy.entries.length > 0 && (
        <section className="mt-8">
          <h2 className="text-xl font-semibold">
            Reservaciones en el intervalo
          </h2>
          <ul className="mt-4 space-y-2">
            {occupancy.entries.map((entry, index) => (
              <li
                key={`${entry.startsAt}-${index}`}
                className="rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm"
              >
                <span className="font-semibold">
                  {formatCalendarTime(entry.startsAt)}–
                  {formatCalendarTime(entry.endsAt)}
                </span>{" "}
                · {entry.isMine ? "Mi reservación" : "Ocupado"} · {entry.target}
              </li>
            ))}
          </ul>
        </section>
      )}

      {data.canManage ? (
        <section className="mt-10 grid gap-6 xl:grid-cols-2">
          <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold">Colocar elemento</h2>
            <p className="mt-1 mb-4 text-sm text-stone-600">
              Las coordenadas son celdas desde la esquina superior izquierda
              (columna 0, fila 0).
            </p>
            <ElementForm
              action={addFloorPlanElementAction.bind(
                null,
                slug,
                spaceSlug,
                data.plan.id,
              )}
              resources={resources
                .filter(
                  (resource) =>
                    !data.elements.some((e) => e.resourceId === resource.id),
                )
                .map(({ id, name }) => ({ id, name }))}
              locations={locations
                .filter(
                  (location) =>
                    !data.elements.some((e) => e.locationId === location.id),
                )
                .map(({ id, name }) => ({ id, name }))}
            />
          </div>
          <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold">Datos del plano</h2>
            <ActionForm
              action={updateFloorPlanAction.bind(
                null,
                slug,
                spaceSlug,
                data.plan.id,
              )}
              submitLabel="Guardar plano"
            >
              <TextField
                id="plan-name"
                name="name"
                label="Nombre"
                maxLength={120}
                defaultValue={data.plan.name}
              />
              <div className="grid grid-cols-2 gap-3">
                <NumberField
                  id="plan-width"
                  name="width"
                  label="Ancho (celdas)"
                  min={1}
                  max={100}
                  defaultValue={data.plan.width}
                />
                <NumberField
                  id="plan-height"
                  name="height"
                  label="Alto (celdas)"
                  min={1}
                  max={100}
                  defaultValue={data.plan.height}
                />
              </div>
            </ActionForm>
            <div className="mt-6 border-t border-stone-100 pt-4">
              <ActionForm
                action={deactivateFloorPlanAction.bind(
                  null,
                  slug,
                  spaceSlug,
                  data.plan.id,
                )}
                submitLabel="Desactivar plano"
                danger
              />
            </div>
          </div>
          {elements.length > 0 && (
            <div className="xl:col-span-2">
              <h2 className="text-lg font-semibold">Elementos colocados</h2>
              <ul className="mt-4 grid gap-3 lg:grid-cols-2">
                {elements.map((element) => (
                  <li
                    key={element.id}
                    className="rounded-2xl border border-stone-200 bg-white p-4"
                  >
                    <details>
                      <summary className="cursor-pointer font-semibold">
                        {element.name}
                        <span className="ml-2 text-sm font-normal text-stone-500">
                          ({element.x}, {element.y}) · {element.width}×
                          {element.height}
                        </span>
                      </summary>
                      <div className="mt-4 space-y-4">
                        <ActionForm
                          action={moveFloorPlanElementAction.bind(
                            null,
                            slug,
                            spaceSlug,
                            data.plan.id,
                            element.id,
                          )}
                          submitLabel="Guardar posición"
                        >
                          <BoxFields
                            prefix={`element-${element.id}`}
                            box={element}
                          />
                        </ActionForm>
                        <ActionForm
                          action={removeFloorPlanElementAction.bind(
                            null,
                            slug,
                            spaceSlug,
                            data.plan.id,
                            element.id,
                          )}
                          submitLabel="Retirar del plano"
                          danger
                        />
                      </div>
                    </details>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
