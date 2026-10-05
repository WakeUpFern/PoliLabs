import Link from "next/link";
import { notFound } from "next/navigation";
import { AuthorizationDeniedError } from "@/modules/identity/domain/access-errors";
import { ReservationNotFoundError } from "@/modules/reservations/domain/reservation";
import { reservationWeb } from "@/modules/reservations/web/services";
import { formatReservationTime } from "@/modules/reservations/web/time";
import { ReservationSummary } from "../reservation-summary";
import { CancelReservationButton } from "../cancel-reservation-button";
import { cancelReservationAction } from "../actions";
export default async function ReservationDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; reservationId: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const { slug, reservationId } = await params;
  let data;
  try {
    data = await reservationWeb.detail(slug, reservationId);
  } catch (error) {
    if (
      error instanceof AuthorizationDeniedError ||
      error instanceof ReservationNotFoundError
    )
      notFound();
    throw error;
  }
  const { reservation } = data;
  const { created } = await searchParams;
  return (
    <div>
      <Link
        className="text-sm font-semibold text-[#7a1731]"
        href={`/app/labs/${slug}/reservations`}
      >
        ← Mis reservaciones
      </Link>
      <h1 className="mt-6 text-3xl font-semibold">Detalle de reservación</h1>
      <p className="mt-3 text-stone-600">
        {data.laboratory.name} · America/Mexico_City
      </p>
      {created === "1" && (
        <p
          role="status"
          className="mt-6 rounded-xl bg-emerald-50 p-4 text-emerald-900"
        >
          Reservación creada correctamente.
        </p>
      )}
      <article className="mt-8 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
        <ReservationSummary reservation={reservation} />
        <p className="mt-5 text-sm text-stone-600">
          Creada:{" "}
          <time dateTime={reservation.createdAt}>
            {formatReservationTime(reservation.createdAt)}
          </time>
        </p>
        {reservation.cancelledAt && (
          <p className="mt-3 text-sm text-stone-600">
            Cancelada:{" "}
            <time dateTime={reservation.cancelledAt}>
              {formatReservationTime(reservation.cancelledAt)}
            </time>
          </p>
        )}
        {data.canCancel &&
          reservation.status === "confirmed" &&
          new Date(reservation.startsAt).getTime() > data.now && (
            <CancelReservationButton
              action={cancelReservationAction.bind(null, slug, reservationId)}
            />
          )}
        {reservation.status === "confirmed" &&
          new Date(reservation.startsAt).getTime() <= data.now && (
            <p className="mt-6 text-sm text-stone-600">
              Esta reservación ya inició o pasó; no se puede cancelar.
            </p>
          )}
      </article>
    </div>
  );
}
