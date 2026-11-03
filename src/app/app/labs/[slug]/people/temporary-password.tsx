"use client";
import { useState } from "react";
import { Check, Copy, KeyRound } from "lucide-react";

export function TemporaryPassword({
  email,
  password,
}: {
  email?: string;
  password: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div
      role="status"
      className="rounded-xl border border-live/30 bg-live/5 p-4 sm:p-5"
    >
      <p className="flex items-center gap-2 font-semibold text-live">
        <KeyRound aria-hidden className="size-5" />
        Contraseña temporal
      </p>
      {email ? (
        <p className="mt-2 text-[0.9375rem]">
          Correo para entrar: <strong>{email}</strong>
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <code
          aria-label="Contraseña temporal"
          className="rounded-lg border border-line bg-surface px-3 py-2 text-lg font-semibold tracking-wide"
        >
          {password}
        </code>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(password);
              setCopied(true);
            } catch {
              setCopied(false);
            }
          }}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-sm font-semibold hover:bg-paper"
        >
          {copied ? (
            <Check aria-hidden className="size-4" />
          ) : (
            <Copy aria-hidden className="size-4" />
          )}
          {copied ? "Copiada" : "Copiar"}
        </button>
      </div>
      <p className="mt-3 text-sm leading-6 text-muted">
        Entrégala en persona; no se volverá a mostrar. Al entrar por primera
        vez, Labora le pedirá elegir su propia contraseña.
      </p>
    </div>
  );
}
