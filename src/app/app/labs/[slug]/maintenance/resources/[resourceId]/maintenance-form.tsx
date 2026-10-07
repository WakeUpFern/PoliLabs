"use client";
import { useActionState, useState, useTransition } from "react";
import { maintenanceAction } from "../../actions";
import type { MaintenanceActionState } from "@/modules/maintenance/web/maintenance-web";
import {
  maintenanceTypeLabels,
  operationalStatusLabels,
  unitLabels,
} from "../../labels";
const MAX_MATERIALS = 20;
const field = "mt-2 block w-full rounded-xl border border-stone-300 p-3";
export function MaintenanceForm({
  slug,
  resourceId,
  currentStatus,
  defaultPerformedLocal,
  incidents,
  items,
}: {
  slug: string;
  resourceId: string;
  currentStatus: keyof typeof operationalStatusLabels;
  defaultPerformedLocal: string;
  incidents: { id: string; label: string }[];
  items: { id: string; name: string; unit: string; quantity: string }[] | null;
}) {
  const [state, action, pending] = useActionState<
    MaintenanceActionState,
    FormData
  >(maintenanceAction.bind(null, slug, resourceId), {
    status: "idle",
    message: "",
  });
  const [, startTransition] = useTransition();
  const [rows, setRows] = useState<number[]>([]);
  const [next, setNext] = useState(0);
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        startTransition(() => action(form));
      }}
    >
      <fieldset disabled={pending} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            Tipo
            <select
              name="type"
              required
              defaultValue="preventive"
              className={field}
            >
              {Object.entries(maintenanceTypeLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            Estado resultante
            <select
              name="statusAfter"
              required
              defaultValue={currentStatus}
              className={field}
            >
              {Object.entries(operationalStatusLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            Fecha y hora de realización
            <input
              type="datetime-local"
              name="performedLocal"
              required
              defaultValue={defaultPerformedLocal}
              max={defaultPerformedLocal}
              className={field}
            />
          </label>
          <label className="block">
            Próximo mantenimiento (opcional)
            <input type="date" name="nextDueOn" className={field} />
          </label>
        </div>
        <label className="block">
          Descripción
          <textarea
            name="description"
            required
            maxLength={5000}
            rows={4}
            className={field}
          />
        </label>
        <label className="block">
          Incidencia relacionada (opcional)
          <select name="incidentId" defaultValue="" className={field}>
            <option value="">Sin incidencia</option>
            {incidents.map((i) => (
              <option key={i.id} value={i.id}>
                {i.label}
              </option>
            ))}
          </select>
        </label>
        {items ? (
          <fieldset className="space-y-3 rounded-xl bg-stone-50 p-4">
            <legend className="font-semibold">Materiales consumidos</legend>
            <p className="text-sm text-stone-600">
              Se registra un consumo de inventario por material junto con la
              entrada; si falta existencia no se guarda nada.
            </p>
            {rows.map((row) => (
              <div
                key={row}
                className="grid gap-3 sm:grid-cols-[1fr_10rem_auto]"
              >
                <label className="block">
                  Artículo
                  <select
                    name="materialItemId"
                    required
                    defaultValue=""
                    className={field}
                  >
                    <option value="" disabled>
                      Selecciona un consumible
                    </option>
                    {items.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} · existencia {item.quantity}{" "}
                        {unitLabels[item.unit] ?? item.unit}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  Cantidad
                  <input
                    name="materialQuantity"
                    required
                    inputMode="decimal"
                    pattern="\d+(\.\d{1,3})?"
                    className={field}
                  />
                </label>
                <button
                  type="button"
                  className="self-end rounded-xl border border-stone-300 px-4 py-3 text-sm"
                  onClick={() => setRows((r) => r.filter((x) => x !== row))}
                >
                  Quitar
                </button>
              </div>
            ))}
            {rows.length < MAX_MATERIALS && items.length ? (
              <button
                type="button"
                className="text-sm font-semibold text-[#7a1731]"
                onClick={() => {
                  setRows((r) => [...r, next]);
                  setNext((n) => n + 1);
                }}
              >
                Añadir material
              </button>
            ) : null}
            {!items.length ? (
              <p className="text-sm">
                No hay consumibles activos en inventario.
              </p>
            ) : null}
          </fieldset>
        ) : (
          <p className="text-sm text-stone-600">
            Registrar materiales consumidos requiere el permiso de movimientos
            de inventario.
          </p>
        )}
        <button
          type="submit"
          className="rounded-xl bg-[#7a1731] px-5 py-3 font-semibold text-white disabled:opacity-50"
        >
          {pending ? "Guardando…" : "Guardar entrada"}
        </button>
      </fieldset>
      {state.message ? (
        <p role={state.status === "error" ? "alert" : "status"}>
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
