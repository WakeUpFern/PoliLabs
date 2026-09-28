"use client";

import { useActionState } from "react";
import {
  initialSpaceActionState,
  type SpaceActionState,
} from "./space-form-state";

export function DeactivateSpaceButton({
  action,
}: {
  action: (
    state: SpaceActionState,
    formData: FormData,
  ) => Promise<SpaceActionState>;
}) {
  const [state, formAction, isPending] = useActionState(
    action,
    initialSpaceActionState,
  );

  return (
    <form action={formAction}>
      <button
        type="submit"
        disabled={isPending}
        className="text-sm font-semibold text-red-700 transition hover:text-red-900 disabled:cursor-wait disabled:opacity-60"
      >
        {isPending ? "Desactivando…" : "Desactivar"}
      </button>
      <span aria-live="polite" className="sr-only">
        {state.message}
      </span>
    </form>
  );
}
