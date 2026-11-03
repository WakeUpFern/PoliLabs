"use client";
export default function ReservationsError({ reset }: { reset: () => void }) {
  return (
    <div role="alert" className="rounded-md border border-line bg-surface p-8">
      <h2 className="text-xl font-semibold">
        No pudimos completar la operación
      </h2>
      <p className="mt-3 text-muted">
        Intenta nuevamente. Si estabas confirmando una reservación, consulta Mis
        reservaciones antes de repetirla.
      </p>
      <button className="btn btn-primary mt-5" onClick={reset}>
        Volver a intentar
      </button>
    </div>
  );
}
