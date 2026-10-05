"use client";
export default function ReservationsError({ reset }: { reset: () => void }) {
  return (
    <div
      role="alert"
      className="rounded-2xl border border-stone-200 bg-white p-8"
    >
      <h2 className="text-xl font-semibold">
        No pudimos completar la operación
      </h2>
      <p className="mt-3 text-stone-600">
        Intenta nuevamente. Si estabas confirmando una reservación, consulta Mis
        reservaciones antes de repetirla.
      </p>
      <button
        className="mt-5 rounded-xl bg-[#7a1731] px-5 py-3 font-semibold text-white"
        onClick={reset}
      >
        Volver a intentar
      </button>
    </div>
  );
}
