"use client";
import { useActionState, useState } from "react";
import {
  initialReservationActionState,
  type ReservationActionState,
} from "@/modules/reservations/web/form-state";
export function CancelReservationButton({
  action,
}: {
  action: (
    state: ReservationActionState,
    form: FormData,
  ) => Promise<ReservationActionState>;
}) {
  const [state, formAction, pending] = useActionState(
    action,
    initialReservationActionState,
  );
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="mt-6 border-t border-stone-200 pt-6">
      {state.status !== "success" &&
        (!confirming ? (
          <button
            type="button"
            className="rounded-xl border border-red-300 px-5 py-3 font-semibold text-red-800"
            onClick={() => setConfirming(true)}
          >
            Cancelar reservación
          </button>
        ) : (
          <form action={formAction}>
            <p className="mb-4 text-sm text-stone-600">
              ¿Confirmas la cancelación? Se conservará en tu historial.
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                disabled={pending}
                type="submit"
                className="rounded-xl bg-red-800 px-5 py-3 font-semibold text-white disabled:opacity-50"
              >
                {pending ? "Cancelando…" : "Sí, cancelar"}
              </button>
              <button
                disabled={pending}
                type="button"
                className="rounded-xl border border-stone-300 px-5 py-3"
                onClick={() => setConfirming(false)}
              >
                Volver
              </button>
            </div>
          </form>
        ))}
      <div aria-live="polite">
        {state.message && (
          <p
            className={`mt-4 rounded-xl p-4 text-sm ${state.status === "success" ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-900"}`}
          >
            {state.message}
          </p>
        )}
      </div>
    </div>
  );
}
