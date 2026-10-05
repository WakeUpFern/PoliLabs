import type { MemberOption } from "@/modules/academic/domain/academic";
import { field } from "./academic-form";
export function SessionFields({
  spaces,
  members,
  actorUserId,
  values,
}: {
  spaces: { id: string; name: string }[];
  members: MemberOption[];
  actorUserId: string;
  values?: {
    spaceId: string;
    teacherUserId: string;
    startsLocal: string;
    endsLocal: string;
  };
}) {
  return (
    <>
      <label className="block font-medium">
        Espacio
        <select
          name="spaceId"
          required
          defaultValue={values?.spaceId ?? ""}
          className={field}
        >
          <option value="" disabled>
            Selecciona un espacio activo
          </option>
          {spaces.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block font-medium">
        Responsable docente
        <select
          name="teacherUserId"
          required
          defaultValue={values?.teacherUserId ?? actorUserId}
          className={field}
        >
          {members
            .filter((m) => m.canTeach)
            .map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
        </select>
      </label>
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="block font-medium">
          Inicio
          <input
            name="startsLocal"
            type="datetime-local"
            required
            defaultValue={values?.startsLocal}
            className={field}
          />
        </label>
        <label className="block font-medium">
          Fin
          <input
            name="endsLocal"
            type="datetime-local"
            required
            defaultValue={values?.endsLocal}
            className={field}
          />
        </label>
      </div>
      <p className="text-sm text-stone-600">
        Horario de Ciudad de México. Programar la sesión no reserva el espacio;
        consulta y gestiona su disponibilidad en Reservaciones.
      </p>
    </>
  );
}
export function ParticipantFields({
  members,
  actorUserId,
  selected = [],
}: {
  members: { id: string; name: string }[];
  actorUserId: string;
  selected?: string[];
}) {
  return (
    <fieldset className="rounded-xl border border-stone-200 p-4">
      <legend className="px-2 font-semibold">Participantes</legend>
      <p className="mb-3 text-sm text-stone-600">
        Lista de participantes previstos. El registro de asistencia se
        incorporará posteriormente.
      </p>
      <div className="max-h-64 space-y-3 overflow-y-auto">
        {members
          .filter((m) => m.id !== actorUserId)
          .map((m) => (
            <label key={m.id} className="flex items-center gap-3">
              <input
                type="checkbox"
                name="participantUserIds"
                value={m.id}
                defaultChecked={selected.includes(m.id)}
                className="h-4 w-4 accent-[#7a1731]"
              />
              {m.name}
            </label>
          ))}
      </div>
      {members.every((m) => m.id === actorUserId) ? (
        <p className="text-sm text-stone-600">
          No hay otros miembros activos disponibles.
        </p>
      ) : null}
    </fieldset>
  );
}
