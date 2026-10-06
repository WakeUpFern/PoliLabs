"use client";
import { useActionState, useTransition, type ReactNode } from "react";
import { usageAction } from "./actions";
export function UsageForm({
  slug,
  operation,
  label,
  children,
}: {
  slug: string;
  operation: "start" | "finish";
  label: string;
  children: ReactNode;
}) {
  const [state, action, pending] = useActionState(
    usageAction.bind(null, slug, operation),
    { status: "idle" as const, message: "" },
  );
  const [, startTransition] = useTransition();
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
        {children}
        <button
          className="rounded-xl bg-[#7a1731] px-5 py-3 font-semibold text-white disabled:opacity-50"
          type="submit"
        >
          {pending ? "Guardando…" : label}
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
