"use client";

import { useState } from "react";
import { authClient } from "@/modules/identity/infrastructure/auth-client";

export function PasswordForm() {
  const [isPending, setIsPending] = useState(false);
  const [message, setMessage] = useState<{
    kind: "error" | "success";
    text: string;
  } | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const currentPassword = String(form.get("currentPassword") ?? "");
    const newPassword = String(form.get("newPassword") ?? "");
    const confirmation = String(form.get("confirmation") ?? "");

    if (newPassword !== confirmation) {
      setMessage({
        kind: "error",
        text: "La confirmación no coincide con la contraseña nueva.",
      });
      return;
    }

    setIsPending(true);
    const { error } = await authClient.changePassword({
      currentPassword,
      newPassword,
      revokeOtherSessions: true,
    });

    if (error) {
      setMessage({
        kind: "error",
        text: "No se pudo cambiar la contraseña. Verifica la contraseña actual y los requisitos indicados.",
      });
      setIsPending(false);
      return;
    }

    formElement.reset();
    setMessage({
      kind: "success",
      text: "Contraseña actualizada. Las demás sesiones abiertas fueron cerradas.",
    });
    setIsPending(false);
  }

  return (
    <form onSubmit={handleSubmit} className="mt-7 space-y-5">
      <div>
        <label
          htmlFor="currentPassword"
          className="mb-2 block text-sm font-semibold text-stone-800"
        >
          Contraseña actual
        </label>
        <input
          id="currentPassword"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
          disabled={isPending}
          className="min-h-12 w-full rounded-xl border border-stone-300 px-4 outline-none transition focus:border-[#7a1731] focus:ring-4 focus:ring-[#7a1731]/10 disabled:bg-stone-100"
        />
      </div>
      <div>
        <label
          htmlFor="newPassword"
          className="mb-2 block text-sm font-semibold text-stone-800"
        >
          Contraseña nueva
        </label>
        <input
          id="newPassword"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          minLength={15}
          maxLength={128}
          required
          disabled={isPending}
          className="min-h-12 w-full rounded-xl border border-stone-300 px-4 outline-none transition focus:border-[#7a1731] focus:ring-4 focus:ring-[#7a1731]/10 disabled:bg-stone-100"
        />
        <p className="mt-2 text-xs leading-5 text-stone-500">
          Usa entre 15 y 128 caracteres. Se permiten frases de paso y pegar
          desde un gestor de contraseñas.
        </p>
      </div>
      <div>
        <label
          htmlFor="confirmation"
          className="mb-2 block text-sm font-semibold text-stone-800"
        >
          Confirmar contraseña nueva
        </label>
        <input
          id="confirmation"
          name="confirmation"
          type="password"
          autoComplete="new-password"
          minLength={15}
          maxLength={128}
          required
          disabled={isPending}
          className="min-h-12 w-full rounded-xl border border-stone-300 px-4 outline-none transition focus:border-[#7a1731] focus:ring-4 focus:ring-[#7a1731]/10 disabled:bg-stone-100"
        />
      </div>

      <div aria-live="polite" className="min-h-6">
        {message ? (
          <p
            className={
              message.kind === "success"
                ? "rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
                : "rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800"
            }
          >
            {message.text}
          </p>
        ) : null}
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="inline-flex min-h-12 items-center justify-center rounded-xl bg-[#7a1731] px-5 font-semibold text-white transition hover:bg-[#651128] focus:outline-none focus:ring-4 focus:ring-[#7a1731]/20 disabled:cursor-wait disabled:opacity-65"
      >
        {isPending ? "Actualizando…" : "Cambiar contraseña"}
      </button>
    </form>
  );
}
