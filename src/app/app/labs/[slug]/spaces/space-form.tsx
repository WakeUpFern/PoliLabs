"use client";

import { useActionState } from "react";
import {
  initialSpaceActionState,
  type SpaceActionState,
} from "./space-form-state";

type SpaceFormProps = {
  action: (
    state: SpaceActionState,
    formData: FormData,
  ) => Promise<SpaceActionState>;
  submitLabel: string;
  space?: { name: string; slug: string; capacity: number | null };
};

export function SpaceForm({ action, submitLabel, space }: SpaceFormProps) {
  const [state, formAction, isPending] = useActionState(
    action,
    initialSpaceActionState,
  );

  return (
    <form action={formAction} className="mt-6 space-y-5">
      <div>
        <label htmlFor="name" className="mb-2 block text-sm font-semibold">
          Nombre
        </label>
        <input
          id="name"
          name="name"
          defaultValue={space?.name}
          required
          disabled={isPending}
          className="min-h-12 w-full rounded-xl border border-stone-300 px-4 outline-none transition focus:border-[#7a1731] focus:ring-4 focus:ring-[#7a1731]/10 disabled:bg-stone-100"
        />
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="slug" className="mb-2 block text-sm font-semibold">
            Slug
          </label>
          <input
            id="slug"
            name="slug"
            defaultValue={space?.slug}
            pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
            required
            disabled={isPending}
            className="min-h-12 w-full rounded-xl border border-stone-300 px-4 font-mono text-sm outline-none transition focus:border-[#7a1731] focus:ring-4 focus:ring-[#7a1731]/10 disabled:bg-stone-100"
          />
          <p className="mt-2 text-xs leading-5 text-stone-500">
            Minúsculas, números y guiones; único en este laboratorio.
          </p>
        </div>
        <div>
          <label
            htmlFor="capacity"
            className="mb-2 block text-sm font-semibold"
          >
            Capacidad{" "}
            <span className="font-normal text-stone-500">(opcional)</span>
          </label>
          <input
            id="capacity"
            name="capacity"
            type="number"
            min={1}
            step={1}
            defaultValue={space?.capacity ?? ""}
            disabled={isPending}
            className="min-h-12 w-full rounded-xl border border-stone-300 px-4 outline-none transition focus:border-[#7a1731] focus:ring-4 focus:ring-[#7a1731]/10 disabled:bg-stone-100"
          />
        </div>
      </div>

      <div aria-live="polite" className="min-h-6">
        {state.message ? (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
            {state.message}
          </p>
        ) : null}
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="inline-flex min-h-12 items-center justify-center rounded-xl bg-[#7a1731] px-5 font-semibold text-white transition hover:bg-[#651128] focus:outline-none focus:ring-4 focus:ring-[#7a1731]/20 disabled:cursor-wait disabled:opacity-65"
      >
        {isPending ? "Guardando…" : submitLabel}
      </button>
    </form>
  );
}
