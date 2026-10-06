import type { AttendanceService } from "../application/attendance";
import type { GetLaboratoryBySlug } from "@/modules/identity/application/get-laboratory-by-slug";
import { AttendanceError } from "../domain/attendance";
import { AuthorizationDeniedError } from "@/modules/identity/domain/access-errors";
export const ATTENDANCE_LABELS = {
  present: "Presente",
  late: "Retardo",
  absent: "Ausente",
} as const;
export type AttendanceActionState = {
  status: "idle" | "success" | "error";
  message: string;
};
export type AttendanceOperation = "checkin" | "record" | "correct";
export function attendanceActionError(error: unknown): AttendanceActionState {
  if (error instanceof AuthorizationDeniedError)
    return {
      status: "error",
      message: "No tienes permiso para realizar esta operación.",
    };
  if (error instanceof AttendanceError)
    return {
      status: "error",
      message: {
        input: "Revisa la selección, el estado y el motivo.",
        "not-found": "La sesión o asistencia no está disponible.",
        state: "El estado de la sesión no permite esta operación.",
        relation:
          "La ubicación o el participante no son válidos para esta sesión.",
        "own-participation":
          "Otro responsable debe gestionar la asistencia de las sesiones en las que participas.",
        conflict:
          "El registro cambió. Actualiza la página antes de corregirlo.",
      }[error.code],
    };
  throw error;
}
export class AttendanceWeb {
  constructor(
    private readonly services: {
      currentActor: () => Promise<{ actorUserId: string }>;
      laboratory: Pick<GetLaboratoryBySlug, "execute">;
      attendance: AttendanceService;
    },
  ) {}
  async context(slug: string) {
    const { actorUserId } = await this.services.currentActor();
    const laboratory = await this.services.laboratory.execute({
      actorUserId,
      laboratorySlug: slug,
    });
    return { actorUserId, laboratoryId: laboratory.id };
  }
  async resolve(slug: string, locationId: string | null) {
    return this.services.attendance.resolve({
      ...(await this.context(slug)),
      locationId,
    });
  }
  async mine(slug: string) {
    return this.services.attendance.mine(await this.context(slug));
  }
  async roster(slug: string, sessionId: string) {
    return this.services.attendance.roster({
      ...(await this.context(slug)),
      sessionId,
    });
  }
  async submit(slug: string, operation: AttendanceOperation, form: FormData) {
    const input = {
      ...(await this.context(slug)),
      source: "WEB",
      sessionId: String(form.get("sessionId") ?? ""),
    };
    if (operation === "checkin")
      return this.services.attendance.checkIn({
        ...input,
        locationId: String(form.get("locationId") ?? "") || null,
      });
    const staff = {
      ...input,
      userId: String(form.get("userId") ?? ""),
      status: String(form.get("status") ?? ""),
      reason: String(form.get("reason") ?? ""),
    };
    if (operation === "record") return this.services.attendance.record(staff);
    if (operation === "correct")
      return this.services.attendance.correct({
        ...staff,
        expectedVersion: Number(form.get("version")),
      });
    throw new AttendanceError("input");
  }
}
