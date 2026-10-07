"use client";
import { useActionState, useState } from "react";
import type { ReservationSpaceOption } from "@/modules/reservations/web/reservation-web";
import {
  initialReservationActionState,
  reservationFormFingerprint,
  type ReservationActionState,
} from "@/modules/reservations/web/form-state";
const inputStyle =
  "min-h-12 w-full rounded-xl border border-stone-300 px-4 focus:outline-none focus:ring-4 focus:ring-[#7a1731]/20";
export function ReservationForm({
  spaces,
  canCreate,
  action,
}: {
  spaces: ReservationSpaceOption[];
  canCreate: boolean;
  action: (
    state: ReservationActionState,
    form: FormData,
  ) => Promise<ReservationActionState>;
}) {
  const [state, formAction, pending] = useActionState(
    action,
    initialReservationActionState,
  );
  const [spaceId, setSpaceId] = useState("");
  const [mode, setMode] = useState("space");
  const [resourceIds, setResourceIds] = useState<string[]>([]);
  const [startsLocal, setStartsLocal] = useState("");
  const [endsLocal, setEndsLocal] = useState("");
  const space = spaces.find((space) => space.id === spaceId);
  const current = new FormData();
  current.set("spaceId", spaceId);
  current.set("mode", mode);
  current.set("startsLocal", startsLocal);
  current.set("endsLocal", endsLocal);
  resourceIds.forEach((id) => current.append("resourceIds", id));
  const message =
    state.fingerprint === reservationFormFingerprint(current)
      ? state.message
      : "";
  const ready = Boolean(
    space &&
    startsLocal &&
    endsLocal &&
    (mode === "space" || resourceIds.length > 0),
  );
  return (
    <form
      action={formAction}
      onReset={(event) => event.preventDefault()}
      className="space-y-6"
    >
      <fieldset disabled={pending} className="space-y-6 disabled:opacity-70">
        <div>
          <label htmlFor="spaceId" className="mb-2 block font-semibold">
            Espacio
          </label>
          <select
            id="spaceId"
            name="spaceId"
            required
            className={inputStyle}
            value={spaceId}
            onChange={(event) => {
              setSpaceId(event.target.value);
              setResourceIds([]);
              setMode("space");
            }}
          >
            <option value="">Selecciona un espacio</option>
            {spaces.map((space) => (
              <option key={space.id} value={space.id}>
                {space.name}
              </option>
            ))}
          </select>
        </div>
        {space && (
          <>
            <fieldset className="space-y-3">
              <legend className="mb-3 font-semibold">
                ¿Qué quieres reservar?
              </legend>
              <label className="flex items-center gap-3">
                <input
                  type="radio"
                  name="mode"
                  value="space"
                  checked={mode === "space"}
                  onChange={() => {
                    setMode("space");
                    setResourceIds([]);
                  }}
                />
                Espacio completo
              </label>
              <label className="flex items-center gap-3">
                <input
                  type="radio"
                  name="mode"
                  value="resources"
                  disabled={
                    !space.canReadResources || space.resources.length === 0
                  }
                  checked={mode === "resources"}
                  onChange={() => setMode("resources")}
                />
                Uno o varios recursos
              </label>
              {!space.canReadResources && (
                <p className="text-sm text-stone-600">
                  No tienes permiso para consultar recursos de este laboratorio.
                </p>
              )}
              {space.canReadResources && !space.resources.length && (
                <p className="text-sm text-stone-600">
                  Este espacio todavía no tiene recursos activos.
                </p>
              )}
            </fieldset>
            {mode === "resources" && (
              <fieldset className="space-y-3 rounded-xl bg-stone-50 p-4">
                <legend className="font-semibold">Recursos del espacio</legend>
                {space.resources.map((resource) => (
                  <label key={resource.id} className="flex items-start gap-3">
                    <input
                      className="mt-1"
                      type="checkbox"
                      name="resourceIds"
                      value={resource.id}
                      disabled={!resource.available}
                      checked={resourceIds.includes(resource.id)}
                      onChange={(event) =>
                        setResourceIds((ids) =>
                          event.target.checked
                            ? [...ids, resource.id]
                            : ids.filter((id) => id !== resource.id),
                        )
                      }
                    />
                    <span>
                      {resource.name}
                      {!resource.available && (
                        <span className="block text-sm text-[#7a1731]">
                          No disponible: en mantenimiento o fuera de servicio
                        </span>
                      )}
                      {resource.location && (
                        <span className="block text-sm text-stone-500">
                          Ubicación: {resource.location}
                        </span>
                      )}
                    </span>
                  </label>
                ))}
              </fieldset>
            )}
          </>
        )}
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="startsLocal" className="mb-2 block font-semibold">
              Fecha y hora de inicio
            </label>
            <input
              id="startsLocal"
              name="startsLocal"
              type="datetime-local"
              step={60}
              required
              value={startsLocal}
              onInput={(event) => setStartsLocal(event.currentTarget.value)}
              className={inputStyle}
            />
          </div>
          <div>
            <label htmlFor="endsLocal" className="mb-2 block font-semibold">
              Fecha y hora de fin
            </label>
            <input
              id="endsLocal"
              name="endsLocal"
              type="datetime-local"
              step={60}
              required
              value={endsLocal}
              onInput={(event) => setEndsLocal(event.currentTarget.value)}
              className={inputStyle}
            />
          </div>
        </div>
        <p className="text-sm leading-6 text-stone-600">
          Horarios de Ciudad de México (America/Mexico_City). Consultar
          disponibilidad es informativo; al confirmar se comprueba nuevamente.
        </p>
        <div className="flex flex-wrap gap-3">
          <button
            type="submit"
            name="intent"
            value="check"
            disabled={!ready}
            className="min-h-12 rounded-xl border border-[#7a1731] px-5 font-semibold text-[#7a1731] disabled:opacity-50"
          >
            Consultar disponibilidad
          </button>
          {canCreate && (
            <button
              type="submit"
              name="intent"
              value="create"
              disabled={!ready}
              className="min-h-12 rounded-xl bg-[#7a1731] px-5 font-semibold text-white disabled:opacity-50"
            >
              Confirmar reservación
            </button>
          )}
        </div>
        {!canCreate && (
          <p className="text-sm text-stone-600">
            Puedes consultar disponibilidad; necesitas permiso de creación para
            confirmar.
          </p>
        )}
      </fieldset>
      <div aria-live="polite" aria-atomic="true">
        {pending ? (
          <p>Procesando…</p>
        ) : (
          message && (
            <p
              className={`rounded-xl p-4 text-sm ${state.status === "available" ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-900"}`}
            >
              {message}
            </p>
          )
        )}
      </div>
    </form>
  );
}
