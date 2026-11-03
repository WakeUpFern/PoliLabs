import Link from "next/link";
import { incidentsWeb } from "@/modules/incidents/web/services";
import { academicWeb } from "@/modules/academic/web/services";
import { SESSION_LABELS } from "@/modules/academic/web/academic-web";
import { formatTime, instantToLocal } from "@/shared/time";
import { academicPageData } from "../../page-data";
import { AcademicForm } from "../../academic-form";
import { SessionFields, ParticipantFields } from "../../session-fields";
export default async function SessionPage({
  params,
}: {
  params: Promise<{ slug: string; sessionId: string }>;
}) {
  const { slug, sessionId } = await params;
  const data = await academicPageData(() =>
    academicWeb.session(slug, sessionId),
  );
  const s = data.session;
  const incidentAccess = await incidentsWeb.access(slug);
  return (
    <div>
      <Link
        href={`/app/labs/${slug}/academic/practices/${s.practiceId}`}
        className="text-sm font-semibold text-muted"
      >
        ← {data.practice.title}
      </Link>
      <header className="mt-6">
        <p className="text-xs font-bold uppercase text-guinda">
          {SESSION_LABELS[s.status]}
        </p>
        <h1 className="mt-2 text-3xl font-semibold">Sesión de laboratorio</h1>
      </header>
      <section className="mt-6 box p-6">
        <dl className="grid gap-6 sm:grid-cols-2">
          <div>
            <dt className="text-sm text-muted">Espacio</dt>
            <dd className="mt-1 font-semibold">{data.spaceName}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted">Responsable docente</dt>
            <dd className="mt-1 font-semibold">{data.teacherName}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted">Inicio · Ciudad de México</dt>
            <dd className="mt-1 font-semibold">{formatTime(s.startsAt)}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted">Fin · Ciudad de México</dt>
            <dd className="mt-1 font-semibold">{formatTime(s.endsAt)}</dd>
          </div>
        </dl>
        <p className="mt-5 text-sm text-muted">
          Esta sesión representa una actividad académica programada. La
          disponibilidad del espacio se gestiona en Reservaciones.
        </p>
      </section>
      <div className="mt-6 flex flex-wrap gap-4">
        {incidentAccess.canCreate ? (
          <Link
            className="font-semibold text-guinda"
            href={`/app/labs/${slug}/incidents/new?target=session:${s.id}`}
          >
            Reportar problema de la sesión
          </Link>
        ) : null}

        {data.canCheckIn ? (
          <Link
            className="font-semibold text-guinda"
            href={`/app/labs/${slug}/attendance`}
          >
            Registrar mi asistencia
          </Link>
        ) : null}
        {data.canManageAttendance ? (
          <Link
            className="font-semibold text-guinda"
            href={`/app/labs/${slug}/attendance/sessions/${s.id}`}
          >
            Consultar asistencia de la sesión
          </Link>
        ) : null}
        {data.canRecordUsage ? (
          <Link
            className="font-semibold text-guinda"
            href={`/app/labs/${slug}/usage`}
          >
            Registrar uso de maquinaria
          </Link>
        ) : null}
      </div>
      {data.isParticipant ? (
        <p className="mt-6 rounded-md bg-paper p-5">
          Estás registrado como participante. Confirma tu asistencia y registra
          por separado el uso efectivo de maquinaria.
        </p>
      ) : null}
      {data.canManage ? (
        <section className="mt-6 box p-6">
          <h2 className="text-xl font-semibold">Participantes registrados</h2>
          {data.participants.length ? (
            <ul className="mt-4 space-y-2">
              {data.participants.map((p) => (
                <li key={p.id}>{p.name}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-muted">Sin participantes registrados.</p>
          )}
        </section>
      ) : null}
      {data.options ? (
        <>
          <section className="mt-6 box p-6">
            <h2 className="mb-5 text-xl font-semibold">Editar sesión</h2>
            <AcademicForm
              slug={slug}
              operation="update-session"
              id={s.id}
              label="Guardar sesión"
            >
              <SessionFields
                {...data.options}
                actorUserId={data.actor.actorUserId}
                values={{
                  spaceId: s.spaceId,
                  teacherUserId: s.teacherUserId,
                  startsLocal: instantToLocal(s.startsAt),
                  endsLocal: instantToLocal(s.endsAt),
                }}
              />
            </AcademicForm>
          </section>
          <section className="mt-6 box p-6">
            <AcademicForm
              slug={slug}
              operation="participants"
              id={s.id}
              label="Guardar participantes"
            >
              <ParticipantFields
                members={[
                  ...data.options.members,
                  ...data.participants.filter(
                    (p) => !data.options!.members.some((m) => m.id === p.id),
                  ),
                ]}
                actorUserId={data.actor.actorUserId}
                selected={data.participants.map((p) => p.id)}
              />
            </AcademicForm>
          </section>
        </>
      ) : null}
      {data.canEdit && (s.status === "scheduled" || s.status === "open") ? (
        <section className="mt-6 flex flex-wrap gap-5 box p-6">
          <AcademicForm
            slug={slug}
            operation="session-status"
            id={s.id}
            label={
              s.status === "scheduled"
                ? "Abrir sesión"
                : "Cerrar sesión académica"
            }
            confirmMessage={
              s.status === "open"
                ? "¿Cerrar esta sesión? Se conservarán sus participantes e historial."
                : undefined
            }
          >
            <input
              type="hidden"
              name="status"
              value={s.status === "scheduled" ? "open" : "closed"}
            />
          </AcademicForm>
          <AcademicForm
            slug={slug}
            operation="session-status"
            id={s.id}
            label="Cancelar sesión"
            confirmMessage="¿Cancelar esta sesión? Se conservará su historial."
          >
            <input type="hidden" name="status" value="cancelled" />
          </AcademicForm>
        </section>
      ) : null}
    </div>
  );
}
