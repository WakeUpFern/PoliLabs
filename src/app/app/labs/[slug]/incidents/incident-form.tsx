"use client";
import { useActionState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { incidentAction } from "./actions";
import type { IncidentActionState } from "@/modules/incidents/web/incidents-web";
export function IncidentForm({
  slug,
  operation,
  label,
  children,
}: {
  slug: string;
  operation: "report" | "transition";
  label: string;
  children: ReactNode;
}) {
  const [state, action, pending] = useActionState<
    IncidentActionState,
    FormData
  >(incidentAction.bind(null, slug, operation), {
    status: "idle",
    message: "",
  });
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
      <fieldset
        disabled={
          pending || (operation === "report" && state.status === "success")
        }
        className="space-y-4"
      >
        {children}
        <button
          type="submit"
          className="rounded-xl bg-[#7a1731] px-5 py-3 font-semibold text-white disabled:opacity-50"
        >
          {pending ? "Guardando…" : label}
        </button>
      </fieldset>
      {state.message ? (
        <p role={state.status === "error" ? "alert" : "status"}>
          {state.message}
        </p>
      ) : null}
      {operation === "report" && state.incidentId ? (
        <Link
          className="inline-block font-semibold text-[#7a1731]"
          href={`/app/labs/${slug}/incidents/${state.incidentId}`}
        >
          Ver reporte y seguimiento
        </Link>
      ) : null}
    </form>
  );
}
