"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/modules/identity/infrastructure/auth-client";

type LoginFormProps = {
  initialMessage?: string;
  clearExistingSession?: boolean;
};

export function LoginForm({
  initialMessage,
  clearExistingSession = false,
}: LoginFormProps) {
  const router = useRouter();
  const [errorMessage, setErrorMessage] = useState(initialMessage ?? "");
  const [isPending, setIsPending] = useState(false);

  useEffect(() => {
    if (clearExistingSession) void authClient.signOut();
  }, [clearExistingSession]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsPending(true);
    setErrorMessage("");

    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    const { error } = await authClient.signIn.email({
      email,
      password,
      rememberMe: true,
    });

    if (error) {
      setErrorMessage(
        "No pudimos iniciar sesión. Revisa tus credenciales e inténtalo de nuevo.",
      );
      setIsPending(false);
      return;
    }

    router.replace("/app");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 space-y-5">
      <div>
        <label
          htmlFor="email"
          className="mb-2 block text-sm font-semibold text-stone-800"
        >
          Correo
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          disabled={isPending}
          className="min-h-12 w-full rounded-xl border border-stone-300 bg-white px-4 text-base text-stone-950 outline-none transition placeholder:text-stone-400 focus:border-[#7a1731] focus:ring-4 focus:ring-[#7a1731]/10 disabled:bg-stone-100"
          placeholder="nombre@institucion.mx"
        />
      </div>
      <div>
        <label
          htmlFor="password"
          className="mb-2 block text-sm font-semibold text-stone-800"
        >
          Contraseña
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          disabled={isPending}
          className="min-h-12 w-full rounded-xl border border-stone-300 bg-white px-4 text-base text-stone-950 outline-none transition focus:border-[#7a1731] focus:ring-4 focus:ring-[#7a1731]/10 disabled:bg-stone-100"
        />
      </div>

      <div aria-live="polite" className="min-h-6">
        {errorMessage ? (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
            {errorMessage}
          </p>
        ) : null}
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="flex min-h-12 w-full items-center justify-center rounded-xl bg-[#7a1731] px-5 font-semibold text-white shadow-sm transition hover:bg-[#651128] focus:outline-none focus:ring-4 focus:ring-[#7a1731]/20 disabled:cursor-wait disabled:opacity-65"
      >
        {isPending ? "Iniciando sesión…" : "Iniciar sesión"}
      </button>
    </form>
  );
}
