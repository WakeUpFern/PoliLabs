import Link from "next/link";
import { attendanceWeb } from "@/modules/attendance/web/services";
import { ATTENDANCE_LABELS } from "@/modules/attendance/web/attendance-web";
import { formatAcademicTime } from "@/modules/academic/web/time";
import { requireCurrentActor } from "@/app/_lib/current-actor";
import { AttendanceForm } from "./attendance-form";
import { attendancePageData } from "./page-data";
export default async function AttendancePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ location?: string }>;
}) {
  const { slug } = await params;
  const { location } = await searchParams;
  const { user } = await requireCurrentActor();
  const data = await attendancePageData(() =>
    attendanceWeb.resolve(slug, location ?? null),
  );
  const history = await attendancePageData(() => attendanceWeb.mine(slug));
  return (
    <div>
      <Link href={`/app/labs/${slug}`}>← Laboratorio</Link>
      <h1 className="mt-6 text-3xl font-semibold">Asistencia</h1>
      <section className="mt-6 space-y-5 rounded-2xl border border-stone-200 bg-white p-6">
        <h2 className="text-xl font-semibold">
          {data.location?.name ?? "Sesiones abiertas"}
        </h2>
        <p>{user.name}</p>
        {data.sessions.length ? (
          <AttendanceForm
            slug={slug}
            operation="checkin"
            label="Registrar asistencia"
          >
            {location ? (
              <input type="hidden" name="locationId" value={location} />
            ) : null}
            <label className="block">
              {data.sessions.length === 1
                ? "Sesión detectada"
                : "¿A qué sesión estás entrando?"}
              <select
                required
                name="sessionId"
                defaultValue={data.selectedSessionId ?? ""}
                className="mt-2 block w-full rounded-xl border border-stone-300 p-3"
              >
                <option value="" disabled>
                  Selecciona una sesión
                </option>
                {data.sessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title} · {formatAcademicTime(s.startsAt)}
                  </option>
                ))}
              </select>
            </label>
            <p className="text-sm text-stone-600">
              Puedes cambiar entre las sesiones disponibles. Abrir este enlace
              no registra asistencia.
            </p>
          </AttendanceForm>
        ) : (
          <p>
            No encontramos una sesión académica abierta asociada a tu cuenta
            {data.location ? " en esta ubicación" : ""}.
          </p>
        )}
        {data.location ? (
          <p className="text-sm text-stone-600">
            La ubicación indica el contexto del registro; no verifica tu
            presencia física.
          </p>
        ) : null}
      </section>
      <section className="mt-6 rounded-2xl border border-stone-200 bg-white p-6">
        <h2 className="text-xl font-semibold">Mi asistencia</h2>
        {history.length ? (
          <ul className="mt-4 space-y-3">
            {history.map((a) => (
              <li key={a.id}>
                <Link
                  className="font-semibold text-[#7a1731]"
                  href={`/app/labs/${slug}/academic/sessions/${a.sessionId}`}
                >
                  Sesión
                </Link>{" "}
                · {ATTENDANCE_LABELS[a.status]} ·{" "}
                {a.checkInAt
                  ? formatAcademicTime(a.checkInAt)
                  : "Sin hora de entrada"}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4">No has registrado asistencia.</p>
        )}
      </section>
    </div>
  );
}
