"use client";
import { useActionState, useState, useTransition } from "react";
import type { InventoryItem } from "@/modules/inventory/domain/inventory";
import {
  MOVEMENT_LABELS,
  UNIT_LABELS,
  TYPE_LABELS,
  type LocationOption,
  type InventoryActionState,
} from "@/modules/inventory/web/inventory-web";
import { inventoryAction } from "./actions";
const field =
  "mt-2 block w-full rounded-xl border border-stone-300 bg-white px-4 py-3";
const button =
  "rounded-xl bg-[#7a1731] px-5 py-3 font-semibold text-white disabled:opacity-50";
export function InventoryForm({
  slug,
  mode,
  item,
  locations = [],
  canAdjust = false,
  hasHistory = false,
}: {
  slug: string;
  mode: "create" | "update" | "movement" | "deactivate";
  item?: InventoryItem;
  locations?: LocationOption[];
  canAdjust?: boolean;
  hasHistory?: boolean;
}) {
  const [quantity, setQuantity] = useState("");
  const [notes, setNotes] = useState("");
  const [, startTransition] = useTransition();
  const [state, action, pending] = useActionState(
    async (previous: InventoryActionState, form: FormData) => {
      const result = await inventoryAction(
        slug,
        mode,
        item?.id ?? null,
        previous,
        form,
      );
      if (result.status === "success" && mode === "movement") {
        setQuantity("");
        setNotes("");
      }
      return result;
    },
    { status: "idle", message: "" } satisfies InventoryActionState,
  );
  const [type, setType] = useState(item?.type ?? "consumable");
  const [unit, setUnit] = useState(item?.unit ?? "piece");
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        // Keep edited fields on errors and avoid native action reset changing a
        // controlled/disabled select to its first option after a successful save.
        startTransition(() => action(form));
      }}
      className="space-y-5"
    >
      <fieldset disabled={pending} className="space-y-5">
        {(mode === "create" || mode === "update") && (
          <>
            <label className="block font-medium">
              Nombre
              <input
                name="name"
                required
                maxLength={200}
                defaultValue={item?.name}
                className={field}
              />
            </label>
            <div className="grid gap-5 sm:grid-cols-2">
              <label className="block font-medium">
                Tipo
                <select
                  name="type"
                  value={type}
                  disabled={hasHistory}
                  onChange={(event) => {
                    const next = event.target.value as InventoryItem["type"];
                    setType(next);
                    if (next === "reusable_tool") setUnit("piece");
                  }}
                  className={field}
                >
                  {Object.entries(TYPE_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
                {hasHistory && <input type="hidden" name="type" value={type} />}
              </label>
              <label className="block font-medium">
                Unidad
                <select
                  name="unit"
                  value={unit}
                  disabled={hasHistory || type === "reusable_tool"}
                  onChange={(event) =>
                    setUnit(event.target.value as InventoryItem["unit"])
                  }
                  className={field}
                >
                  {Object.entries(UNIT_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
                {(hasHistory || type === "reusable_tool") && (
                  <input type="hidden" name="unit" value={unit} />
                )}
              </label>
            </div>
            {hasHistory && (
              <p className="text-sm text-stone-600">
                El tipo y la unidad se conservan porque el artículo ya tiene
                movimientos.
              </p>
            )}
            <label className="block font-medium">
              Ubicación opcional
              <select
                name="locationId"
                defaultValue={item?.locationId ?? ""}
                className={field}
              >
                <option value="">Sin ubicación</option>
                {item?.locationId &&
                  !locations.some(
                    (option) => option.id === item.locationId,
                  ) && (
                    <option value={item.locationId}>
                      Ubicación fuera del catálogo visible
                    </option>
                  )}
                {locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.label}
                  </option>
                ))}
              </select>
            </label>
            {mode === "update" && (
              <p className="text-sm text-stone-600">
                Cambiar la ubicación actualiza la referencia principal; los
                movimientos conservan la ubicación registrada en su fecha.
              </p>
            )}
            {mode === "create" && canAdjust && (
              <>
                <label className="block font-medium">
                  Existencia inicial
                  <input
                    name="initialQuantity"
                    type="number"
                    min="0"
                    step={unit === "piece" ? "1" : "0.001"}
                    defaultValue="0"
                    className={field}
                  />
                </label>
                <label className="block font-medium">
                  Motivo de la existencia inicial
                  <input
                    name="notes"
                    maxLength={1000}
                    defaultValue="Inventario inicial"
                    className={field}
                  />
                </label>
              </>
            )}
            {mode === "create" && !canAdjust && (
              <p className="text-sm text-stone-600">
                El artículo se creará con saldo cero. Registrar existencias
                requiere permiso de movimientos.
              </p>
            )}
          </>
        )}
        {mode === "movement" && item && (
          <>
            <p className="text-stone-600">
              Existencia actual:{" "}
              <strong>
                {item.quantity} {UNIT_LABELS[item.unit]}
              </strong>
              . El saldo se volverá a comprobar al registrar.
            </p>
            <label className="block font-medium">
              Operación
              <select name="type" className={field}>
                {Object.entries(MOVEMENT_LABELS)
                  .filter(
                    ([key]) =>
                      key !== "initial" &&
                      !(key === "consumption" && item.type === "reusable_tool"),
                  )
                  .map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
              </select>
            </label>
            <label className="block font-medium">
              Cantidad ({UNIT_LABELS[item.unit]})
              <input
                name="quantity"
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
                type="number"
                min={item.unit === "piece" ? "1" : "0.001"}
                step={item.unit === "piece" ? "1" : "0.001"}
                required
                className={field}
              />
            </label>
            <label className="block font-medium">
              Motivo
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                name="notes"
                required
                maxLength={1000}
                rows={3}
                className={field}
              />
            </label>
          </>
        )}
        {mode === "deactivate" && (
          <p className="text-sm text-stone-600">
            Sólo se puede desactivar con saldo cero. El artículo y su historial
            permanecerán consultables.
          </p>
        )}
        <button type="submit" className={button} disabled={pending}>
          {pending
            ? "Guardando…"
            : {
                create: "Registrar artículo",
                update: "Guardar artículo",
                movement: "Registrar movimiento",
                deactivate: "Desactivar artículo",
              }[mode]}
        </button>
      </fieldset>
      {state.message && (
        <p
          role={state.status === "error" ? "alert" : "status"}
          className={`rounded-xl p-4 text-sm ${state.status === "error" ? "bg-red-50 text-red-800" : "bg-green-50 text-green-800"}`}
        >
          {state.message}
        </p>
      )}
    </form>
  );
}
