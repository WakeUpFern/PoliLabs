"use client";

import { useActionState, useState, type ReactNode } from "react";
import {
  initialOrganizationActionState,
  type OrganizationActionState,
} from "../organization-form-state";

type Action = (
  state: OrganizationActionState,
  form: FormData,
) => Promise<OrganizationActionState>;

const inputStyle =
  "min-h-11 w-full rounded-xl border border-stone-300 bg-white px-3 outline-none transition focus:border-[#7a1731] focus:ring-4 focus:ring-[#7a1731]/10";

export function ActionForm({
  action,
  submitLabel,
  children,
  danger = false,
}: {
  action: Action;
  submitLabel: string;
  children?: ReactNode;
  danger?: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    action,
    initialOrganizationActionState,
  );
  return (
    // Keep typed values after an error instead of React's automatic reset.
    <form
      action={formAction}
      onReset={(event) => event.preventDefault()}
      className="space-y-4"
    >
      <fieldset disabled={pending} className="space-y-4">
        {children}
      </fieldset>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className={
            danger
              ? "text-sm font-semibold text-red-700 transition hover:text-red-900 disabled:opacity-60"
              : "inline-flex min-h-11 items-center justify-center rounded-xl bg-[#7a1731] px-4 text-sm font-semibold text-white transition hover:bg-[#651128] disabled:cursor-wait disabled:opacity-65"
          }
        >
          {pending ? "Guardando…" : submitLabel}
        </button>
        <p
          aria-live="polite"
          className={`text-sm ${state.status === "error" ? "text-red-700" : "text-emerald-700"}`}
        >
          {state.message}
        </p>
      </div>
    </form>
  );
}

export function NumberField({
  id,
  name,
  label,
  defaultValue,
  min,
  max,
}: {
  id: string;
  name: string;
  label: string;
  defaultValue?: number;
  min: number;
  max: number;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-semibold">
        {label}
      </label>
      <input
        id={id}
        name={name}
        type="number"
        inputMode="numeric"
        required
        min={min}
        max={max}
        step={1}
        defaultValue={defaultValue}
        className={inputStyle}
      />
    </div>
  );
}

export function TextField({
  id,
  name,
  label,
  defaultValue,
  maxLength,
}: {
  id: string;
  name: string;
  label: string;
  defaultValue?: string;
  maxLength: number;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-semibold">
        {label}
      </label>
      <input
        id={id}
        name={name}
        required
        maxLength={maxLength}
        defaultValue={defaultValue}
        className={inputStyle}
      />
    </div>
  );
}

export function BoxFields({
  prefix,
  box,
}: {
  prefix: string;
  box?: { x: number; y: number; width: number; height: number };
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <NumberField
        id={`${prefix}-x`}
        name="x"
        label="Columna (x)"
        min={0}
        max={99}
        defaultValue={box?.x ?? 0}
      />
      <NumberField
        id={`${prefix}-y`}
        name="y"
        label="Fila (y)"
        min={0}
        max={99}
        defaultValue={box?.y ?? 0}
      />
      <NumberField
        id={`${prefix}-width`}
        name="width"
        label="Ancho"
        min={1}
        max={100}
        defaultValue={box?.width ?? 2}
      />
      <NumberField
        id={`${prefix}-height`}
        name="height"
        label="Alto"
        min={1}
        max={100}
        defaultValue={box?.height ?? 2}
      />
    </div>
  );
}

export function ElementForm({
  action,
  resources,
  locations,
}: {
  action: Action;
  resources: { id: string; name: string }[];
  locations: { id: string; name: string }[];
}) {
  const [kind, setKind] = useState(resources.length ? "resource" : "label");
  return (
    <ActionForm action={action} submitLabel="Colocar en el plano">
      <div>
        <label
          htmlFor="element-kind"
          className="mb-1 block text-sm font-semibold"
        >
          Tipo de elemento
        </label>
        <select
          id="element-kind"
          name="kind"
          value={kind}
          onChange={(event) => setKind(event.target.value)}
          className={inputStyle}
        >
          <option value="resource" disabled={!resources.length}>
            Recurso reservable
          </option>
          <option value="location" disabled={!locations.length}>
            Ubicación
          </option>
          <option value="label">Etiqueta visual (puerta, pasillo…)</option>
        </select>
      </div>
      {kind === "resource" && (
        <div>
          <label
            htmlFor="element-resource"
            className="mb-1 block text-sm font-semibold"
          >
            Recurso
          </label>
          <select
            id="element-resource"
            name="resourceId"
            required
            className={inputStyle}
          >
            {resources.map((resource) => (
              <option key={resource.id} value={resource.id}>
                {resource.name}
              </option>
            ))}
          </select>
        </div>
      )}
      {kind === "location" && (
        <div>
          <label
            htmlFor="element-location"
            className="mb-1 block text-sm font-semibold"
          >
            Ubicación
          </label>
          <select
            id="element-location"
            name="locationId"
            required
            className={inputStyle}
          >
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </select>
        </div>
      )}
      {kind === "label" && (
        <TextField
          id="element-label"
          name="label"
          label="Texto"
          maxLength={80}
        />
      )}
      <BoxFields prefix="element" />
    </ActionForm>
  );
}
