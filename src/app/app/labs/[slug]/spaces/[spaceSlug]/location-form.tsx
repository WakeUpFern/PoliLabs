"use client";

import { useActionState } from "react";
import type { LocationDetails } from "@/modules/spatial/domain/location";
import {
  initialOrganizationActionState,
  type OrganizationActionState,
} from "./organization-form-state";

type Props = {
  action: (
    state: OrganizationActionState,
    formData: FormData,
  ) => Promise<OrganizationActionState>;
  locations: readonly LocationDetails[];
  submitLabel: string;
  formId: string;
  location?: LocationDetails;
};

export function LocationForm({
  action,
  locations,
  submitLabel,
  formId,
  location,
}: Props) {
  const [state, formAction, isPending] = useActionState(
    action,
    initialOrganizationActionState,
  );
  const parentOptions = locations.filter(({ id }) => id !== location?.id);

  return (
    <form action={formAction} className="mt-5 space-y-4">
      <div>
        <label
          htmlFor={`${formId}-name`}
          className="mb-2 block text-sm font-semibold"
        >
          Nombre
        </label>
        <input
          id={`${formId}-name`}
          name="name"
          defaultValue={location?.name}
          required
          disabled={isPending}
          className="min-h-11 w-full rounded-md border border-line px-3 outline-none transition focus:border-guinda focus:ring-4 focus:ring-guinda/10 disabled:bg-paper"
        />
      </div>
      <div>
        <label
          htmlFor={`${formId}-parent`}
          className="mb-2 block text-sm font-semibold"
        >
          Ubicación padre{" "}
          <span className="font-normal text-muted">(opcional)</span>
        </label>
        <select
          id={`${formId}-parent`}
          name="parentId"
          defaultValue={location?.parentId ?? ""}
          disabled={isPending}
          className="min-h-11 w-full rounded-md border border-line bg-surface px-3 outline-none transition focus:border-guinda focus:ring-4 focus:ring-guinda/10 disabled:bg-paper"
        >
          <option value="">Sin ubicación padre</option>
          {parentOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </select>
      </div>
      <ActionFeedback state={state} />
      <button type="submit" disabled={isPending} className="btn btn-primary">
        {isPending ? "Guardando…" : submitLabel}
      </button>
    </form>
  );
}

function ActionFeedback({ state }: { state: OrganizationActionState }) {
  if (!state.message) return <div aria-live="polite" className="min-h-5" />;
  return (
    <p
      aria-live="polite"
      className={`rounded-lg px-3 py-2 text-sm ${
        state.status === "error"
          ? "bg-red-50 text-red-800"
          : "bg-emerald-50 text-emerald-800"
      }`}
    >
      {state.message}
    </p>
  );
}
