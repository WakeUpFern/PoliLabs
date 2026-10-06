import Link from "next/link";
import { academicWeb } from "@/modules/academic/web/services";
import { SESSION_LABELS } from "@/modules/academic/web/academic-web";
import {
  formatAcademicTime,
  instantToLocal,
} from "@/modules/academic/web/time";
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
  return (
    <div>
      <Link
        href={`/app/labs/${slug}/academic/practices/${s.practiceId}`}
        className="text-sm font-semibold text-stone-600"
      >
        ← {data.practice.title}
      </Link>
      <header className="mt-6">
        <p className="text-xs font-bold uppercase text-[#7a1731]">
          {SESSION_LABELS[s.status]}
        </p>
        <h1 className="mt-2 text-3xl font-semibold">Sesión de laboratorio</h1>
      </header>
      <section className="mt-6 rounded-2xl border border-stone-200 bg-white p-6">
        <dl className="grid gap-6 sm:grid-cols-2">
          <div>
            <dt className="text-sm text-stone-600">Espacio</dt>
            <dd className="mt-1 font-semibold">{data.spaceName}</dd>
          </div>
          <div>
            <dt className="text-sm text-stone-600">Responsable docente</dt>
            <dd className="mt-1 font-semibold">{data.teacherName}</dd>
          </div>
          <div>
            <dt className="text-sm text-stone-600">
              Inicio · Ciudad de México
            </dt>
            <dd className="mt-1 font-semibold">
              {formatAcademicTime(s.startsAt)}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-stone-600">Fin · Ciudad de México</dt>
            <dd className="mt-1 font-semibold">
              {formatAcademicTime(s.endsAt)}
            </dd>
          </div>
        </dl>
        <p className="mt-5 text-sm text-stone-600">
          Esta sesión representa una actividad académica programada. La
          disponibilidad del espacio se gestiona en Reservaciones.
        </p>
      </section>
      <div className="mt-6 flex flex-wrap gap-4">
        {data.canCheckIn ? (
          <Link
            className="font-semibold text-[#7a1731]"
            href={`/app/labs/${slug}/attendance`}
          >
            Registrar mi asistencia
          </Link>
        ) : null}
        {data.canManageAttendance ? (
          <Link
            className="font-semibold text-[#7a1731]"
            href={`/app/labs/${slug}/attendance/sessions/${s.id}`}
          >
            Consultar asistencia de la sesión
          </Link>
        ) : null}
      </div>
      {data.isParticipant ? (
        <p className="mt-6 rounded-xl bg-stone-100 p-5">
          Estás registrado como participante. Confirma tu asistencia; el uso de
          maquinaria se registrará por separado en Usage I.
        </p>
      ) : null}
      {data.canManage ? (
        <section className="mt-6 rounded-2xl border border-stone-200 bg-white p-6">
          <h2 className="text-xl font-semibold">Participantes registrados</h2>
          {data.participants.length ? (
            <ul className="mt-4 space-y-2">
              {data.participants.map((p) => (
                <li key={p.id}>{p.name}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-stone-600">
              Sin participantes registrados.
            </p>
          )}
        </section>
      ) : null}
      {data.options ? (
        <>
          <section className="mt-6 rounded-2xl border border-stone-200 bg-white p-6">
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
          <section className="mt-6 rounded-2xl border border-stone-200 bg-white p-6">
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
        <section className="mt-6 flex flex-wrap gap-5 rounded-2xl border border-stone-200 bg-white p-6">
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
