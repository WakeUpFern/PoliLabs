import { notFound } from "next/navigation";
import { AuthorizationDeniedError } from "@/modules/identity/domain/access-errors";
import { membersWeb } from "@/modules/identity/web/services";
import { AddMemberForm } from "./add-member-form";
import { MemberRow } from "./member-row";

export default async function PeoplePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  let overview;
  try {
    overview = await membersWeb.overview(slug);
  } catch (error) {
    if (error instanceof AuthorizationDeniedError) notFound();
    throw error;
  }
  const { members, roles, canAssignRoles } = overview;
  const active = members.filter((member) => member.isActive).length;
  // Most accounts a teacher creates are students; preselect the narrowest role.
  const defaultRole =
    roles.find((role) => role.key === "laboratory_student")?.key ??
    roles[0]?.key ??
    "";

  return (
    <div>
      <h1 className="text-3xl font-bold tracking-tight">Personas</h1>
      <p className="mt-2 max-w-2xl leading-7 text-muted">
        Da de alta a tus alumnos y a otros profesores. Cada cuenta nueva recibe
        una contraseña temporal que la persona cambia la primera vez que entra.
      </p>

      <section
        aria-labelledby="add-member"
        className="mt-8 rounded-xl border border-line bg-surface p-5 sm:p-6"
      >
        <h2 id="add-member" className="text-xl font-bold">
          Agregar a una persona
        </h2>
        {roles.length > 0 ? (
          <div className="mt-4">
            <AddMemberForm
              slug={slug}
              roles={roles}
              defaultRoleKey={defaultRole}
            />
          </div>
        ) : (
          <p className="mt-2 text-muted">
            Tu cuenta no puede asignar ningún rol en este laboratorio.
          </p>
        )}
      </section>

      <section aria-labelledby="member-list" className="mt-10">
        <div className="flex items-baseline justify-between gap-4">
          <h2 id="member-list" className="text-xl font-bold">
            Quién tiene acceso
          </h2>
          <p className="text-sm text-muted">
            {active} con acceso de {members.length}
          </p>
        </div>
        <ul className="mt-4 divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
          {members.map((member) => (
            <MemberRow
              key={member.membershipId}
              slug={slug}
              member={member}
              roles={roles}
              canAssignRoles={canAssignRoles}
            />
          ))}
        </ul>
      </section>
    </div>
  );
}
