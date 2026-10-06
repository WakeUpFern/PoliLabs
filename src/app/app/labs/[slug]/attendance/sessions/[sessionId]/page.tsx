import Link from "next/link";
import { attendanceWeb } from "@/modules/attendance/web/services";
import { ATTENDANCE_LABELS } from "@/modules/attendance/web/attendance-web";
import { attendanceService } from "@/modules/attendance/infrastructure/services";
import { formatAcademicTime } from "@/modules/academic/web/time";
import { AttendanceForm } from "../../attendance-form";
import { attendancePageData } from "../../page-data";
export default async function SessionAttendancePage({
  params,
}: {
  params: Promise<{ slug: string; sessionId: string }>;
}) {
  const { slug, sessionId } = await params;
  const context = await attendanceWeb.context(slug);
  const rows = await attendancePageData(() =>
    attendanceWeb.roster(slug, sessionId),
  );
  const events = await attendancePageData(() =>
    attendanceService.history({ ...context, sessionId }),
  );
  const own = rows.some((r) => r.userId === context.actorUserId);
  const policy = await attendancePageData(() =>
    attendanceService.managementPolicy({ ...context, sessionId }),
  );
  return (
    <div>
      <Link href={`/app/labs/${slug}/academic/sessions/${sessionId}`}>
        ← Sesión
      </Link>
      <h1 className="mt-6 text-3xl font-semibold">Asistencia de la sesión</h1>
      {own ? (
        <p className="mt-4">
          Otro responsable debe realizar las correcciones de esta sesión.
        </p>
      ) : null}
      <div className="mt-6 space-y-4">
        {rows.map((r) => (
          <article
            key={r.userId}
            className="rounded-2xl border border-stone-200 bg-white p-6"
          >
            <h2 className="font-semibold">{r.name}</h2>
            <p className="mt-2">
              {r.attendance
                ? ATTENDANCE_LABELS[r.attendance.status]
                : "Sin registro"}{" "}
              ·{" "}
              {r.attendance?.checkInAt
                ? formatAcademicTime(r.attendance.checkInAt)
                : "Sin hora de entrada"}
            </p>
            {r.attendance?.locationId ? (
              <p className="mt-2 break-all text-sm">
                Ubicación de entrada: {r.locationName ?? "Ubicación registrada"}
              </p>
            ) : null}
            {!own && (r.attendance ? policy.canCorrect : policy.canRecord) ? (
              <details className="mt-4">
                <summary className="cursor-pointer font-semibold text-[#7a1731]">
                  {r.attendance
                    ? "Corregir asistencia"
                    : "Registrar por personal"}
                </summary>
                <AttendanceForm
                  slug={slug}
                  operation={r.attendance ? "correct" : "record"}
                  label="Guardar asistencia"
                >
                  <input type="hidden" name="sessionId" value={sessionId} />
                  <input type="hidden" name="userId" value={r.userId} />
                  {r.attendance ? (
                    <input
                      type="hidden"
                      name="version"
                      value={r.attendance.version}
                    />
                  ) : null}
                  <label className="block">
                    Estado
                    <select
                      name="status"
                      defaultValue={r.attendance?.status ?? "present"}
                      className="mt-2 block w-full rounded-xl border p-3"
                    >
                      {Object.entries(ATTENDANCE_LABELS).map(
                        ([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ),
                      )}
                    </select>
                  </label>
                  <label className="block">
                    Motivo
                    <textarea
                      name="reason"
                      required
                      maxLength={2000}
                      className="mt-2 block w-full rounded-xl border p-3"
                    />
                  </label>
                </AttendanceForm>
              </details>
            ) : null}
          </article>
        ))}
      </div>
      <section className="mt-6 rounded-2xl border border-stone-200 bg-white p-6">
        <h2 className="text-xl font-semibold">
          Historial de registros y correcciones
        </h2>
        <ul className="mt-4 space-y-3">
          {events.map((e) => (
            <li key={e.id}>
              {rows.find((r) => r.userId === e.userId)?.name ?? "Participante"}{" "}
              ·{" "}
              {e.action === "attendance.corrected" ? "Corrección" : "Registro"}{" "}
              por {e.actorName} · {formatAcademicTime(e.createdAt)}
              {e.reason ? ` · ${e.reason}` : ""}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
