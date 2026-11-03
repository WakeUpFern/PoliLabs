"use client";
import { useActionState, useEffect, useRef } from "react";
import { UserRoundPlus } from "lucide-react";
import type { MemberActionState } from "@/modules/identity/web/members-web";
import type { RoleOption } from "@/modules/identity/application/member-administration";
import { createMemberAction } from "./actions";
import { TemporaryPassword } from "./temporary-password";

const input =
  "mt-1.5 block min-h-11 w-full rounded-lg border border-line bg-surface px-3 outline-none transition focus:border-guinda focus:ring-4 focus:ring-guinda/10";

export function AddMemberForm({
  slug,
  roles,
  defaultRoleKey,
}: {
  slug: string;
  roles: RoleOption[];
  defaultRoleKey: string;
}) {
  const [state, action, pending] = useActionState<MemberActionState, FormData>(
    createMemberAction.bind(null, slug),
    { status: "idle", message: "" },
  );
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.status === "success") form.current?.reset();
  }, [state]);

  return (
    <div className="space-y-5">
      <form ref={form} action={action} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-semibold">
            Nombre completo
            <input
              name="name"
              required
              maxLength={120}
              autoComplete="off"
              className={input}
            />
          </label>
          <label className="block text-sm font-semibold">
            Correo
            <input
              name="email"
              type="email"
              required
              maxLength={254}
              autoComplete="off"
              placeholder="nombre@alumno.ipn.mx"
              className={input}
            />
          </label>
        </div>
        <fieldset>
          <legend className="text-sm font-semibold">Rol</legend>
          <div className="mt-1.5 grid gap-2 sm:grid-cols-3">
            {roles.map((role) => (
              <label
                key={role.key}
                className="flex cursor-pointer gap-3 rounded-lg border border-line bg-surface p-3 transition has-[:checked]:border-guinda has-[:checked]:bg-guinda-tint/50"
              >
                <input
                  type="radio"
                  name="roleKey"
                  value={role.key}
                  defaultChecked={role.key === defaultRoleKey}
                  required
                  className="mt-1 accent-guinda"
                />
                <span>
                  <span className="block font-semibold">{role.name}</span>
                  <span className="mt-0.5 block text-sm leading-snug text-muted">
                    {role.description}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-guinda px-5 font-semibold text-white transition hover:bg-guinda-deep disabled:cursor-wait disabled:opacity-65"
          >
            <UserRoundPlus aria-hidden className="size-5" />
            {pending ? "Creando…" : "Crear cuenta"}
          </button>
          <p aria-live="polite" className="text-sm">
            {state.status === "error" ? (
              <span className="text-red-800">{state.message}</span>
            ) : state.status === "success" && !state.temporaryPassword ? (
              <span className="text-live">{state.message}</span>
            ) : null}
          </p>
        </div>
      </form>
      {state.status === "success" && state.temporaryPassword ? (
        <TemporaryPassword
          email={state.email}
          password={state.temporaryPassword}
        />
      ) : null}
    </div>
  );
}
