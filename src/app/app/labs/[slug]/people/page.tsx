import { notFound } from "next/navigation";
import { AuthorizationDeniedError } from "@/modules/identity/domain/access-errors";
import { membersWeb } from "@/modules/identity/web/services";
import { AddMemberPanel } from "./add-member-panel";
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
      <AddMemberPanel slug={slug} roles={roles} defaultRoleKey={defaultRole} />

      <section
        aria-labelledby="member-list"
        className="box mt-6 overflow-hidden"
      >
        <h2
          id="member-list"
          className="flex items-center gap-2 border-b border-line bg-paper px-4 py-3 font-bold"
        >
          Con acceso
          <span className="counter">{active}</span>
          {members.length > active ? (
            <span className="text-sm font-normal text-muted">
              ({members.length - active} sin acceso)
            </span>
          ) : null}
        </h2>
        <ul className="divide-y divide-line">
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
