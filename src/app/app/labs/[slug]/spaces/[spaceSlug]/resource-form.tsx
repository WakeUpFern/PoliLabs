"use client";

import { useActionState } from "react";
import type { LocationDetails } from "@/modules/spatial/domain/location";
import type { ResourceDetails } from "@/modules/spatial/domain/resource";
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
  resource?: ResourceDetails;
};

export function ResourceForm({
  action,
  locations,
  submitLabel,
  formId,
  resource,
}: Props) {
  const [state, formAction, isPending] = useActionState(
    action,
    initialOrganizationActionState,
  );

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
          defaultValue={resource?.name}
          required
          disabled={isPending}
          className="min-h-11 w-full rounded-md border border-line px-3 outline-none transition focus:border-guinda focus:ring-4 focus:ring-guinda/10 disabled:bg-paper"
        />
      </div>
      <div>
        <label
          htmlFor={`${formId}-location`}
          className="mb-2 block text-sm font-semibold"
        >
          Ubicación <span className="font-normal text-muted">(opcional)</span>
        </label>
        <select
          id={`${formId}-location`}
          name="locationId"
          defaultValue={resource?.locationId ?? ""}
          disabled={isPending}
          className="min-h-11 w-full rounded-md border border-line bg-surface px-3 outline-none transition focus:border-guinda focus:ring-4 focus:ring-guinda/10 disabled:bg-paper"
        >
          <option value="">Sin ubicación específica</option>
          {locations.map((location) => (
            <option key={location.id} value={location.id}>
              {location.name}
            </option>
          ))}
        </select>
      </div>
      {state.message ? (
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
      ) : (
        <div aria-live="polite" className="min-h-5" />
      )}
      <button type="submit" disabled={isPending} className="btn btn-primary">
        {isPending ? "Guardando…" : submitLabel}
      </button>
    </form>
  );
}
