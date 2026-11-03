import { laboratoryContext } from "@/modules/identity/web/laboratory-context";
import type { AcademicService } from "../application/academic";
import type { GetLaboratoryBySlug } from "@/modules/identity/application/get-laboratory-by-slug";
import type { AuthorizationService } from "@/modules/identity/application/authorization-service";
import { AuthorizationDeniedError } from "@/modules/identity/domain/access-errors";
import { AcademicError } from "../domain/academic";
const invalid = () => new AcademicError("input");
import { localToInstant } from "@/shared/time";
export const PRACTICE_LABELS = {
  draft: "Borrador",
  published: "Publicada",
  closed: "Cerrada",
} as const;
export const SESSION_LABELS = {
  scheduled: "Programada",
  open: "Abierta",
  closed: "Cerrada",
  cancelled: "Cancelada",
} as const;
export type AcademicActionState = {
  status: "idle" | "success" | "error";
  message: string;
};
export type AcademicOperation =
  | "create-practice"
  | "update-practice"
  | "practice-status"
  | "create-session"
  | "update-session"
  | "session-status"
  | "participants";
export function academicActionError(error: unknown): AcademicActionState {
  if (error instanceof AuthorizationDeniedError)
    return {
      status: "error",
      message:
        "Ya no tienes permiso para realizar esta operación en el laboratorio.",
    };
  if (error instanceof AcademicError) {
    const messages = {
      input:
        "Revisa el título, las instrucciones, el horario y los participantes. El inicio debe ser anterior al fin.",
      "not-found":
        "La práctica o sesión no está disponible en este laboratorio.",
      state:
        "El estado cambió o no permite esta operación. Publica la práctica antes de programar sesiones y termina sus sesiones antes de cerrarla.",
      relation:
        "Selecciona un espacio activo, un responsable con permiso académico y participantes activos del mismo laboratorio.",
      "own-participation":
        "No puedes gestionar una sesión en la que participas como alumno ni modificar tu propia participación. Solicita la intervención de otro responsable.",
    };
    return { status: "error", message: messages[error.code] };
  }
  throw error;
}
export class AcademicWeb {
  constructor(
    private readonly services: {
      currentActor: () => Promise<{ actorUserId: string }>;
      laboratory: Pick<GetLaboratoryBySlug, "execute">;
      authorization: Pick<AuthorizationService, "authorize">;
      academic: AcademicService;
    },
  ) {}
  private async context(slug: string) {
    const { laboratory, actor } = await laboratoryContext(this.services, slug);
    const grant = await this.services.authorization.authorize({
      ...actor,
      requiredPermission: "academic.read",
    });
    return {
      actor,
      laboratory,
      canManage: grant.permissionKeys.includes("academic.manage"),
      canCheckIn: grant.permissionKeys.includes("attendance.checkin"),
      canManageAttendance: grant.permissionKeys.includes("attendance.manage"),
      canRecordUsage: grant.permissionKeys.includes("usage.record"),
    };
  }
  async list(slug: string) {
    const context = await this.context(slug);
    return {
      ...context,
      practices: await this.services.academic.list(context.actor),
    };
  }
  /**
   * The next sessions that matter to the actor, for the laboratory home: a
   * teacher's own sessions, or the sessions a student takes part in. Reads
   * published practices through the same authorized service calls.
   */
  async upcoming(slug: string, now = new Date(), limit = 5) {
    const context = await this.context(slug);
    const practices = (await this.services.academic.list(context.actor))
      .filter((practice) => practice.status === "published")
      .slice(0, 20);
    const details = await Promise.all(
      practices.map((practice) =>
        this.services.academic.practice({
          ...context.actor,
          practiceId: practice.id,
        }),
      ),
    );
    const sessions = details
      .flatMap(({ practice, sessions }) =>
        sessions.map((session) => ({
          ...session,
          practiceTitle: practice.title,
        })),
      )
      .filter(
        (session) =>
          (session.status === "scheduled" || session.status === "open") &&
          session.endsAt.getTime() >= now.getTime() &&
          (!context.canManage ||
            session.teacherUserId === context.actor.actorUserId),
      )
      .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
      .slice(0, limit);
    return { ...context, sessions };
  }
  async practice(slug: string, practiceId: string) {
    const context = await this.context(slug);
    const detail = await this.services.academic.practice({
      ...context.actor,
      practiceId,
    });
    return {
      ...context,
      ...detail,
      options:
        context.canManage && detail.practice.status === "published"
          ? await this.services.academic.options(context.actor)
          : null,
    };
  }
  async session(slug: string, sessionId: string) {
    const context = await this.context(slug);
    const detail = await this.services.academic.session({
      ...context.actor,
      sessionId,
    });
    const canEdit = context.canManage && !detail.isParticipant;
    return {
      ...context,
      ...detail,
      canEdit,
      options:
        canEdit && detail.session.status === "scheduled"
          ? await this.services.academic.options(context.actor)
          : null,
    };
  }
  async newPractice(slug: string) {
    const context = await this.context(slug);
    await this.services.authorization.authorize({
      ...context.actor,
      requiredPermission: "academic.manage",
    });
    return context;
  }
  async submit(
    slug: string,
    operation: AcademicOperation,
    id: string | null,
    form: FormData,
  ): Promise<{ practiceId?: string; sessionId?: string }> {
    const { actor } = await this.context(slug);
    // Identity and origin always come from the server, never the posted form.
    const common = { ...actor, source: "WEB" };
    const value = (key: string) => String(form.get(key) ?? "");
    const participants = () => form.getAll("participantUserIds").map(String);
    const values = () => ({
      spaceId: value("spaceId"),
      teacherUserId: value("teacherUserId"),
      startsAt: localToInstant(value("startsLocal"), invalid),
      endsAt: localToInstant(value("endsLocal"), invalid),
    });
    switch (operation) {
      case "create-practice": {
        const row = await this.services.academic.createPractice({
          ...common,
          title: value("title"),
          instructions: value("instructions"),
        });
        return { practiceId: row.id };
      }
      case "update-practice":
        await this.services.academic.updatePractice({
          ...common,
          practiceId: id ?? "",
          title: value("title"),
          instructions: value("instructions"),
        });
        return { practiceId: id ?? "" };
      case "practice-status":
        await this.services.academic.changePracticeStatus({
          ...common,
          practiceId: id ?? "",
          status: value("status"),
        });
        return { practiceId: id ?? "" };
      case "create-session": {
        const row = await this.services.academic.createSession({
          ...common,
          practiceId: id ?? "",
          ...values(),
          participantUserIds: participants(),
        });
        return { practiceId: row.practiceId, sessionId: row.id };
      }
      case "update-session":
        await this.services.academic.updateSession({
          ...common,
          sessionId: id ?? "",
          ...values(),
        });
        return { sessionId: id ?? "" };
      case "session-status":
        await this.services.academic.changeSessionStatus({
          ...common,
          sessionId: id ?? "",
          status: value("status"),
        });
        return { sessionId: id ?? "" };
      case "participants":
        await this.services.academic.setParticipants({
          ...common,
          sessionId: id ?? "",
          participantUserIds: participants(),
        });
        return { sessionId: id ?? "" };
      default:
        throw new AcademicError("input");
    }
  }
}
