import type { ReservationView } from "@/modules/reservations/web/reservation-web";
import { formatReservationTime } from "@/modules/reservations/web/time";
export function ReservationSummary({
  reservation,
}: {
  reservation: ReservationView;
}) {
  return (
    <div className="space-y-3 text-sm leading-6 text-stone-600">
      <p className="text-lg font-semibold text-stone-900">
        {reservation.spaceName}
      </p>
      <p>
        <span className="font-semibold">Modalidad:</span>{" "}
        {reservation.isExclusive ? "Espacio completo" : "Recursos"}
      </p>
      {reservation.resources.length > 0 && (
        <ul className="list-inside list-disc">
          {reservation.resources.map((resource) => (
            <li key={resource.id}>
              {resource.name}
              {resource.location ? ` · ${resource.location}` : ""}
            </li>
          ))}
        </ul>
      )}
      <p>
        <span className="font-semibold">Inicio:</span>{" "}
        <time dateTime={reservation.startsAt}>
          {formatReservationTime(reservation.startsAt)}
        </time>
      </p>
      <p>
        <span className="font-semibold">Fin:</span>{" "}
        <time dateTime={reservation.endsAt}>
          {formatReservationTime(reservation.endsAt)}
        </time>
      </p>
      <p>
        <span className="font-semibold">Estado:</span>{" "}
        <span
          className={
            reservation.status === "confirmed"
              ? "font-semibold text-emerald-800"
              : "font-semibold text-stone-700"
          }
        >
          {reservation.status === "confirmed" ? "Confirmada" : "Cancelada"} (
          {reservation.status})
        </span>
      </p>
    </div>
  );
}
