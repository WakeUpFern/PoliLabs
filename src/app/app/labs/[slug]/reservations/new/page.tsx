import Link from "next/link";
import { notFound } from "next/navigation";
import { AuthorizationDeniedError } from "@/modules/identity/domain/access-errors";
import { reservationWeb } from "@/modules/reservations/web/services";
import { reservationFormAction } from "../actions";
import { ReservationForm } from "../reservation-form";
export default async function NewReservationPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  let data;
  try {
    data = await reservationWeb.newForm(slug);
  } catch (error) {
    if (error instanceof AuthorizationDeniedError) notFound();
    throw error;
  }
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
