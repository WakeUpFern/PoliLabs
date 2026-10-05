import Link from "next/link";
import { academicWeb } from "@/modules/academic/web/services";
import {
  PRACTICE_LABELS,
  SESSION_LABELS,
} from "@/modules/academic/web/academic-web";
import { formatAcademicTime } from "@/modules/academic/web/time";
import { academicPageData } from "../../page-data";
import { AcademicForm, field } from "../../academic-form";
import { SessionFields, ParticipantFields } from "../../session-fields";
export default async function PracticePage({
  params,
}: {
  params: Promise<{ slug: string; practiceId: string }>;
}) {
  const { slug, practiceId } = await params;
  const data = await academicPageData(() =>
    academicWeb.practice(slug, practiceId),
  );
  const p = data.practice;
  return (
    <div>
      <Link
        href={`/app/labs/${slug}/academic`}
        className="text-sm font-semibold text-stone-600"
      >
        ← Prácticas
      </Link>
      <header className="mt-6">
        <p className="text-xs font-bold uppercase text-[#7a1731]">
          {PRACTICE_LABELS[p.status]}
        </p>
        <h1 className="mt-2 text-3xl font-semibold">{p.title}</h1>
      </header>
      <section className="mt-6 rounded-2xl border border-stone-200 bg-white p-6">
        <h2 className="text-lg font-semibold">Instrucciones</h2>
        <p className="mt-4 whitespace-pre-wrap leading-7 text-stone-700">
          {p.instructions}
        </p>
      </section>
      {data.canManage && p.status !== "closed" ? (
        <section className="mt-6 rounded-2xl border border-stone-200 bg-white p-6">
          <details>
            <summary className="cursor-pointer font-semibold">
              Editar práctica
            </summary>
            <div className="mt-5">
              <AcademicForm
                slug={slug}
                operation="update-practice"
                id={p.id}
                label="Guardar práctica"
              >
                <label className="block font-medium">
                  Título
                  <input
                    name="title"
                    required
                    maxLength={200}
                    defaultValue={p.title}
                    className={field}
                  />
                </label>
                <label className="block font-medium">
                  Instrucciones
                  <textarea
                    name="instructions"
                    required
                    maxLength={20000}
                    defaultValue={p.instructions}
                    rows={8}
                    className={field}
                  />
                </label>
              </AcademicForm>
            </div>
          </details>
          <div className="mt-5">
            <AcademicForm
              slug={slug}
              operation="practice-status"
              id={p.id}
              label={
                p.status === "draft" ? "Publicar práctica" : "Cerrar práctica"
              }
              confirmMessage={
                p.status === "published"
                  ? "¿Cerrar esta práctica? Primero deben terminar todas sus sesiones. La práctica conservará su historial."
                  : undefined
              }
            >
              <input
                type="hidden"
                name="status"
                value={p.status === "draft" ? "published" : "closed"}
              />
            </AcademicForm>
          </div>
        </section>
      ) : null}
      <section className="mt-8">
        <h2 className="text-xl font-semibold">
          {data.canManage ? "Sesiones" : "Mis sesiones"}
        </h2>
        <div className="mt-4 grid gap-4">
          {data.sessions.map((s) => (
            <Link
              key={s.id}
              href={`/app/labs/${slug}/academic/sessions/${s.id}`}
              className="rounded-xl border border-stone-200 bg-white p-5"
            >
              <p className="font-semibold">
                {formatAcademicTime(s.startsAt)} →{" "}
                {formatAcademicTime(s.endsAt)}
              </p>
              <p className="mt-2 text-sm text-[#7a1731]">
                {SESSION_LABELS[s.status]}
              </p>
            </Link>
          ))}
          {data.sessions.length === 0 ? (
            <p className="text-stone-600">No hay sesiones para mostrar.</p>
          ) : null}
        </div>
      </section>
      {data.options ? (
        <section className="mt-8 rounded-2xl border border-stone-200 bg-white p-6">
          <h2 className="mb-5 text-xl font-semibold">Programar sesión</h2>
          <AcademicForm
            slug={slug}
            operation="create-session"
            id={p.id}
            label="Programar sesión"
          >
            <SessionFields
              {...data.options}
              actorUserId={data.actor.actorUserId}
            />
            <ParticipantFields
              members={data.options.members}
              actorUserId={data.actor.actorUserId}
            />
          </AcademicForm>
        </section>
      ) : null}
    </div>
  );
}
