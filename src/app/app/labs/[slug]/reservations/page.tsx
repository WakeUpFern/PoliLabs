import Link from "next/link";
import { notFound } from "next/navigation";
import { AuthorizationDeniedError } from "@/modules/identity/domain/access-errors";
import { reservationWeb } from "@/modules/reservations/web/services";
import { ReservationSummary } from "./reservation-summary";
export default async function ReservationsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  let data;
  try {
    data = await reservationWeb.list(slug);
  } catch (error) {
    if (error instanceof AuthorizationDeniedError) notFound();
    throw error;
  }
  const now = data.now;
  const upcoming = data.reservations.filter(
    (reservation) =>
      reservation.status === "confirmed" &&
      new Date(reservation.endsAt).getTime() > now,
  );
  const history = data.reservations.filter(
    (reservation) => !upcoming.includes(reservation),
  );
  return (
    <div>
      <Link
        href={`/app/labs/${slug}`}
        className="text-sm font-semibold text-[#7a1731]"
      >
        ← {data.laboratory.name}
      </Link>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Mis reservaciones</h1>
          <p className="mt-3 text-stone-600">
            Reservaciones propias de {data.laboratory.name}. Horarios en
            America/Mexico_City.
          </p>
        </div>
        {data.canCreate && (
          <Link
            href={`/app/labs/${slug}/reservations/new`}
            className="rounded-xl bg-[#7a1731] px-5 py-3 font-semibold text-white"
          >
            Nueva reservación
          </Link>
        )}
      </div>
      {data.reservations.length === 0 ? (
        <p className="mt-8 rounded-2xl border border-dashed border-stone-300 bg-stone-50 p-8 text-stone-600">
          Todavía no tienes reservaciones en este laboratorio.
          {data.canCreate
            ? " Selecciona Nueva reservación para comenzar."
            : " Necesitas permiso de creación para reservar."}
        </p>
      ) : (
        [
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
        )
      )}
    </div>
  );
}
