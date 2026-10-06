"use client";
import { useActionState, useTransition, type ReactNode } from "react";
import type { AttendanceOperation } from "@/modules/attendance/web/attendance-web";
import { attendanceAction } from "./actions";
export function AttendanceForm({
  slug,
  operation,
  children,
  label,
}: {
  slug: string;
  operation: AttendanceOperation;
  children: ReactNode;
  label: string;
}) {
  const [state, action, pending] = useActionState(
    attendanceAction.bind(null, slug, operation),
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
    </form>
  );
}
