import { KeyRound } from "lucide-react";
import { requireCurrentActor } from "@/app/_lib/current-actor";
import { passwordChangePendingFor } from "@/modules/identity/infrastructure/services";
import { PasswordForm } from "./password-form";

export default async function SecurityPage() {
  const { actorUserId } = await requireCurrentActor();
  const pending = await passwordChangePendingFor(actorUserId);

  return (
    <div className="max-w-2xl">
      <h1 className="text-3xl font-bold tracking-tight">Contraseña</h1>
      {pending ? (
        <div className="mt-5 flex gap-3 rounded-xl border border-pending/30 bg-pending/5 p-4">
          <KeyRound
            aria-hidden
            className="mt-0.5 size-5 flex-none text-pending"
          />
          <div>
            <p className="font-semibold">Elige tu propia contraseña</p>
            <p className="mt-1 leading-6 text-muted">
              Entraste con una contraseña temporal. Escríbela en «Contraseña
              actual» y elige una nueva para continuar al laboratorio.
            </p>
          </div>
        </div>
      ) : (
        <p className="mt-2 leading-7 text-muted">
          Al cambiarla, esta sesión sigue abierta y se cierran las demás.
        </p>
      )}

      <section className="mt-6 rounded-xl border border-line bg-surface p-5 sm:p-6">
        <h2 className="text-xl font-bold">Cambiar contraseña</h2>
        <PasswordForm continueTo={pending ? "/app" : null} />
      </section>
    </div>
  );
}
