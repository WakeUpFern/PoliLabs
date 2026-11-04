"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/modules/identity/infrastructure/auth-client";
import { describeSignInFailure, signInErrorMessages } from "./sign-in-error";

type LoginFormProps = {
  returnPath?: string;
  initialMessage?: string;
  clearExistingSession?: boolean;
};

const subscribeToNothing = () => () => {};

export function LoginForm({
  returnPath = "/app",
  initialMessage,
  clearExistingSession = false,
}: LoginFormProps) {
  const router = useRouter();
  const [errorMessage, setErrorMessage] = useState(initialMessage ?? "");
  const [isPending, setIsPending] = useState(false);
  // The form only works once React has hydrated it; before that, submitting
  // would fall back to a native GET that puts the credentials in the URL.
  const isReady = useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false,
  );

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
    let failure: string | null;
    try {
      const { error } = await authClient.signIn.email({
        email,
        password,
        rememberMe: true,
      });
      failure = error ? describeSignInFailure(error) : null;
    } catch {
      failure = signInErrorMessages.unavailable;
    }

    if (failure) {
      setErrorMessage(failure);
      setIsPending(false);
      return;
    }

    router.replace(returnPath);
    router.refresh();
  }

  return (
    <form method="post" onSubmit={handleSubmit} className="mt-8 space-y-5">
      <div>
        <label
          htmlFor="email"
          className="mb-2 block text-sm font-semibold text-ink"
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
          className="min-h-12 w-full rounded-md border border-line bg-surface px-4 text-base text-ink outline-none transition placeholder:text-muted focus:border-guinda focus:ring-4 focus:ring-guinda/10 disabled:bg-paper"
          placeholder="nombre@institucion.mx"
        />
      </div>
      <div>
        <label
          htmlFor="password"
          className="mb-2 block text-sm font-semibold text-ink"
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
          className="min-h-12 w-full rounded-md border border-line bg-surface px-4 text-base text-ink outline-none transition focus:border-guinda focus:ring-4 focus:ring-guinda/10 disabled:bg-paper"
        />
      </div>

      <div aria-live="polite" className="min-h-6">
        {errorMessage ? (
          <p
            role="alert"
            className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800"
          >
            {errorMessage}
          </p>
        ) : null}
        {isReady ? null : (
          <p className="reveal-if-stalled rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
            La página no terminó de cargar, así que todavía no se puede iniciar
            sesión. Recarga la página; si abriste PoliLabs desde otro
            dispositivo de la red local, su dirección debe estar en
            BETTER_AUTH_TRUSTED_ORIGINS del servidor.
          </p>
        )}
      </div>

      <button
        type="submit"
        disabled={isPending || !isReady}
        className="btn btn-primary w-full"
      >
        {isPending ? "Iniciando sesión…" : "Iniciar sesión"}
      </button>
    </form>
  );
}
