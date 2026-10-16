import Link from "next/link";
import type { ReservationView } from "@/modules/reservations/web/reservation-web";
import { ReservationSummary } from "./reservation-summary";

export function MyReservations({
  slug,
  now,
  canCreate,
  reservations,
}: {
  slug: string;
  now: number;
  canCreate: boolean;
  reservations: ReservationView[];
}) {
  const upcoming = reservations.filter(
    (reservation) =>
      reservation.status === "confirmed" &&
      new Date(reservation.endsAt).getTime() > now,
  );
  const history = reservations.filter(
    (reservation) => !upcoming.includes(reservation),
  );
  if (reservations.length === 0)
    return (
      <p className="mt-8 rounded-2xl border border-dashed border-stone-300 bg-stone-50 p-8 text-stone-600">
        Todavía no tienes reservaciones en este laboratorio.
        {canCreate
          ? " Elige una franja libre en el calendario para comenzar."
          : " Necesitas permiso de creación para reservar."}
      </p>
    );
  return [
    { title: "Próximas y en curso", rows: upcoming },
    { title: "Pasadas y canceladas", rows: history },
  ].map(
    (group) =>
      group.rows.length > 0 && (
        <section key={group.title} className="mt-8">
          <h2 className="text-xl font-semibold">{group.title}</h2>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            {group.rows.map((reservation) => (
              <article
                key={reservation.id}
                className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm"
              >
                <ReservationSummary reservation={reservation} />
                <Link
                  className="mt-5 inline-block font-semibold text-[#7a1731]"
                  href={`/app/labs/${slug}/reservations/${reservation.id}`}
                >
                  Ver detalle →
                </Link>
              </article>
            ))}
          </div>
        </section>
      ),
  );
}
