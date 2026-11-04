"use client";
import { useState } from "react";
import { UserRoundPlus } from "lucide-react";
import type { RoleOption } from "@/modules/identity/application/member-administration";
import { AddMemberForm } from "./add-member-form";

/** Page header with the main action; the form appears only when asked for. */
export function AddMemberPanel({
  slug,
  roles,
  defaultRoleKey,
}: {
  slug: string;
  roles: RoleOption[];
  defaultRoleKey: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Personas</h1>
        {roles.length > 0 ? (
          <button
            type="button"
            aria-expanded={open}
            aria-controls="add-member"
            onClick={() => setOpen((value) => !value)}
            className="btn btn-primary"
          >
            <UserRoundPlus aria-hidden className="size-4" />
            Agregar persona
          </button>
        ) : null}
      </div>
      {open ? (
        <section id="add-member" className="box mt-4 overflow-hidden">
          <h2 className="border-b border-line bg-paper px-4 py-3 font-bold">
            Agregar persona
          </h2>
          <div className="p-4">
            <AddMemberForm
              slug={slug}
              roles={roles}
              defaultRoleKey={defaultRoleKey}
            />
          </div>
        </section>
      ) : null}
    </>
  );
}
