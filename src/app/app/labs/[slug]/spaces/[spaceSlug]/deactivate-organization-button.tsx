"use client";

import { useActionState } from "react";
import {
  initialOrganizationActionState,
  type OrganizationActionState,
} from "./organization-form-state";

export function DeactivateOrganizationButton({
  action,
  label,
}: {
  action: (
    state: OrganizationActionState,
    formData: FormData,
  ) => Promise<OrganizationActionState>;
  label: string;
}) {
  const [state, formAction, isPending] = useActionState(
    action,
    initialOrganizationActionState,
  );
  return (
    <form action={formAction}>
      <button
        type="submit"
        disabled={isPending}
        className="text-sm font-semibold text-red-700 transition hover:text-red-900 disabled:cursor-wait disabled:opacity-60"
      >
        {isPending ? "Desactivando…" : label}
      </button>
      <span aria-live="polite" className="ml-3 text-xs text-red-700">
        {state.status === "error" ? state.message : null}
      </span>
    </form>
  );
}
