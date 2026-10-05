"use client";
import { useActionState, useState, useTransition } from "react";
import type { ReactNode } from "react";
import type {
  AcademicActionState,
  AcademicOperation,
} from "@/modules/academic/web/academic-web";
import { academicAction } from "./actions";
export const field =
  "mt-2 block w-full rounded-xl border border-stone-300 bg-white px-4 py-3";
export function AcademicForm({
  slug,
  operation,
  id = null,
  label,
  children,
  confirmMessage,
}: {
  slug: string;
  operation: AcademicOperation;
  id?: string | null;
  label: string;
  children?: ReactNode;
  confirmMessage?: string;
}) {
  const [state, action, pending] = useActionState(
    academicAction.bind(null, slug, operation, id),
    { status: "idle", message: "" } satisfies AcademicActionState,
  );
  const [, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  return (
    <form
      className="space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        if (confirmMessage && !confirming) {
          setConfirming(true);
          return;
        }
        setConfirming(false);
        const form = new FormData(event.currentTarget);
        startTransition(() => action(form));
      }}
    >
      <fieldset disabled={pending} className="space-y-5">
        {children}
        {confirming ? (
          <p
            role="status"
            className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"
          >
            {confirmMessage}
          </p>
        ) : null}
        <button
          className="rounded-xl bg-[#7a1731] px-5 py-3 font-semibold text-white disabled:opacity-50"
          type="submit"
        >
          {pending ? "Guardando…" : confirming ? "Confirmar" : label}
        </button>
        {confirming ? (
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="ml-3 rounded-xl border border-stone-300 px-5 py-3 font-semibold"
          >
            Volver
          </button>
        ) : null}
      </fieldset>
      {state.message ? (
        <p
          role={state.status === "error" ? "alert" : "status"}
          className={
            state.status === "error"
              ? "text-sm text-red-700"
              : "text-sm text-green-800"
          }
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
