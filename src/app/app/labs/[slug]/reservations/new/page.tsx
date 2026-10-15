import Link from "next/link";
import { notFound } from "next/navigation";
import { AuthorizationDeniedError } from "@/modules/identity/domain/access-errors";
import { reservationWeb } from "@/modules/reservations/web/services";
import { reservationFormAction } from "../actions";
import { ReservationForm } from "../reservation-form";
const LOCAL = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const text = (value: string | string[] | undefined) =>
  typeof value === "string" ? value : "";

export default async function NewReservationPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  let data;
  try {
    data = await reservationWeb.newForm(slug);
  } catch (error) {
    if (error instanceof AuthorizationDeniedError) notFound();
    throw error;
  }
  // Prefill from the floor plan or calendar; the form still sends everything
  // through the same availability and creation services.
  const space = data.spaces.find((space) => space.id === text(query.space));
  const resource = space?.resources.find(
    (resource) => resource.id === text(query.resource) && resource.available,
  );
  const initial = space
    ? {
        spaceId: space.id,
        mode: resource ? "resources" : "space",
        resourceIds: resource ? [resource.id] : [],
        startsLocal: LOCAL.test(text(query.start)) ? text(query.start) : "",
        endsLocal: LOCAL.test(text(query.end)) ? text(query.end) : "",
      }
    : undefined;
  return (
    <div>
      <Link
        href={`/app/labs/${slug}/reservations`}
        className="text-sm font-semibold text-[#7a1731]"
      >
        ← Mis reservaciones
      </Link>
      <h1 className="mt-6 text-3xl font-semibold">Nueva reservación</h1>
      <p className="mt-3 text-stone-600">
        {data.laboratory.name} · Fechas y horas en America/Mexico_City.
      </p>
      <section className="mt-8 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
        {data.spaces.length ? (
          <ReservationForm
            spaces={data.spaces}
            canCreate={data.canCreate}
            initial={initial}
            action={reservationFormAction.bind(null, slug)}
          />
        ) : (
          <p className="text-stone-600">
            Todavía no hay espacios activos disponibles para reservar.
          </p>
        )}
      </section>
    </div>
  );
}
