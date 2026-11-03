"use client";
import { useActionState, useState } from "react";
import { KeyRound, UserRoundCheck, UserRoundX } from "lucide-react";
import type { MemberActionState } from "@/modules/identity/web/members-web";
import type {
  MemberView,
  RoleOption,
} from "@/modules/identity/application/member-administration";
import {
  changeRoleAction,
  resetPasswordAction,
  setActiveAction,
} from "./actions";
import { TemporaryPassword } from "./temporary-password";

const idle: MemberActionState = { status: "idle", message: "" };
const quiet = "btn disabled:cursor-wait disabled:opacity-60";

function Status({ member }: { member: MemberView }) {
  if (!member.isActive)
    return (
      <span className="rounded-full bg-ink/8 px-2.5 py-0.5 text-[0.8125rem] font-semibold text-muted">
        Sin acceso
      </span>
    );
  if (member.passwordChangePending)
    return (
      <span className="rounded-full bg-pending/10 px-2.5 py-0.5 text-[0.8125rem] font-semibold text-pending">
        Aún no cambia su contraseña
      </span>
    );
  return (
    <span className="rounded-full bg-live/10 px-2.5 py-0.5 text-[0.8125rem] font-semibold text-live">
      Activo
    </span>
  );
}

export function MemberRow({
  slug,
  member,
  roles,
  canAssignRoles,
}: {
  slug: string;
  member: MemberView;
  roles: RoleOption[];
  canAssignRoles: boolean;
}) {
  const [roleState, roleAction, rolePending] = useActionState(
    changeRoleAction.bind(null, slug),
    idle,
  );
  const [activeState, activeAction, activePending] = useActionState(
    setActiveAction.bind(null, slug),
    idle,
  );
  const [passwordState, passwordAction, passwordPending] = useActionState(
    resetPasswordAction.bind(null, slug),
    idle,
  );
  const currentRole = member.roleKeys[0] ?? "";
  const [role, setRole] = useState(currentRole);
  const messages = [roleState, activeState, passwordState].filter(
    (state) => state.status !== "idle" && !state.temporaryPassword,
  );
  const roleEditable =
    canAssignRoles &&
    member.canManage &&
    roles.some((option) => option.key === currentRole || !currentRole);

  return (
    <li className="px-4 py-4 sm:px-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 font-semibold">
            {member.name}
            {member.isSelf ? (
              <span className="rounded-full bg-guinda-tint px-2 py-0.5 text-[0.75rem] text-guinda-deep">
                Tú
              </span>
            ) : null}
          </p>
          <p className="truncate text-sm text-muted">{member.email}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Status member={member} />
          {roleEditable ? (
            <form action={roleAction} className="flex items-center gap-2">
              <input
                type="hidden"
                name="membershipId"
                value={member.membershipId}
              />
              <label
                className="sr-only"
                htmlFor={`role-${member.membershipId}`}
              >
                Rol de {member.name}
              </label>
              <select
                id={`role-${member.membershipId}`}
                name="roleKey"
                value={role}
                onChange={(event) => setRole(event.target.value)}
                className="min-h-9 rounded-md border border-line bg-surface px-2.5 text-sm"
              >
                {!currentRole ? <option value="">Sin rol</option> : null}
                {roles.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.name}
                  </option>
                ))}
              </select>
              {role !== currentRole && role ? (
                <button type="submit" disabled={rolePending} className={quiet}>
                  {rolePending ? "Guardando…" : "Cambiar rol"}
                </button>
              ) : null}
            </form>
          ) : (
            <span className="text-sm text-muted">
              {member.roleNames.join(", ") || "Sin rol"}
            </span>
          )}

          {member.canManage ? (
            <>
              {member.isActive ? (
                <form
                  action={passwordAction}
                  onSubmit={(event) => {
                    if (
                      !window.confirm(
                        `¿Crear una nueva contraseña temporal para ${member.name}? Su contraseña actual dejará de funcionar y se cerrarán sus sesiones.`,
                      )
                    )
                      event.preventDefault();
                  }}
                >
                  <input
                    type="hidden"
                    name="membershipId"
                    value={member.membershipId}
                  />
                  <input type="hidden" name="email" value={member.email} />
                  <button
                    type="submit"
                    disabled={passwordPending}
                    className={quiet}
                  >
                    <KeyRound aria-hidden className="size-4" />
                    Nueva contraseña
                  </button>
                </form>
              ) : null}
              <form
                action={activeAction}
                onSubmit={(event) => {
                  if (
                    member.isActive &&
                    !window.confirm(
                      `¿Quitar el acceso de ${member.name} a este laboratorio? Su historial se conserva y puedes devolverle el acceso después.`,
                    )
                  )
                    event.preventDefault();
                }}
              >
                <input
                  type="hidden"
                  name="membershipId"
                  value={member.membershipId}
                />
                <input
                  type="hidden"
                  name="active"
                  value={member.isActive ? "false" : "true"}
                />
                <button
                  type="submit"
                  disabled={activePending}
                  className={quiet}
                >
                  {member.isActive ? (
                    <UserRoundX aria-hidden className="size-4" />
                  ) : (
                    <UserRoundCheck aria-hidden className="size-4" />
                  )}
                  {member.isActive ? "Quitar acceso" : "Devolver acceso"}
                </button>
              </form>
            </>
          ) : null}
        </div>
      </div>

      {messages.length > 0 ? (
        <div aria-live="polite" className="mt-2 space-y-1 text-sm">
          {messages.map((state, index) => (
            <p
              key={index}
              className={
                state.status === "error" ? "text-red-800" : "text-live"
              }
            >
              {state.message}
            </p>
          ))}
        </div>
      ) : null}
      {passwordState.status === "success" && passwordState.temporaryPassword ? (
        <div className="mt-3">
          <TemporaryPassword
            email={passwordState.email}
            password={passwordState.temporaryPassword}
          />
        </div>
      ) : null}
    </li>
  );
}
