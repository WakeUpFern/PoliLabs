import type { GetLaboratoryBySlug } from "@/modules/identity/application/get-laboratory-by-slug";
import { AuthorizationDeniedError } from "@/modules/identity/domain/access-errors";
import type { IncidentService } from "../application/incidents";
import { IncidentError } from "../domain/incidents";
export type IncidentActionState = {
  status: "idle" | "success" | "error";
  message: string;
  incidentId?: string;
};
export function incidentActionError(error: unknown): IncidentActionState {
  if (error instanceof AuthorizationDeniedError)
    return {
      status: "error",
      message: "No tienes permiso para realizar esta operación.",
    };
  if (error instanceof IncidentError)
    return {
      status: "error",
      message: {
        input:
          "Revisa el objetivo, la severidad y los campos obligatorios (máximo 5000 caracteres).",
        "not-found":
          "El reporte o el objetivo no está disponible para tu cuenta.",
        relation:
          "El uso debe seguir abierto, ser propio y corresponder al recurso. Puedes reportar sin uso asociado.",
        state:
          "La incidencia debe pasar de abierta a en revisión y después a resuelta.",
        conflict:
          "Otra persona modificó la incidencia. Recarga para ver su estado actual.",
      }[error.code],
    };
  throw error;
}
export class IncidentsWeb {
  constructor(
    private readonly services: {
      currentActor: () => Promise<{ actorUserId: string }>;
      laboratory: Pick<GetLaboratoryBySlug, "execute">;
      incidents: IncidentService;
    },
  ) {}
  async context(slug: string) {
    const { actorUserId } = await this.services.currentActor();
    const lab = await this.services.laboratory.execute({
      actorUserId,
      laboratorySlug: slug,
    });
    return { actorUserId, laboratoryId: lab.id };
  }
  async access(slug: string) {
    return this.services.incidents.access(await this.context(slug));
  }
  async page(slug: string, scope: string) {
    const context = await this.context(slug);
    const access = await this.services.incidents.access(context);
    const entries =
      scope === "own" && !access.canReadOwn
        ? []
        : await this.services.incidents.list({ ...context, scope });
    return { access, entries };
  }
  async options(slug: string) {
    return this.services.incidents.options(await this.context(slug));
  }
  async detail(slug: string, id: string, scope: string) {
    const context = await this.context(slug);
    const [access, data] = await Promise.all([
      this.services.incidents.access(context),
      this.services.incidents.detail({ ...context, incidentId: id, scope }),
    ]);
    const usages =
      access.canTrace && data.incident.resourceId
        ? await this.services.incidents.trace({ ...context, incidentId: id })
        : null;
    return { ...data, access, usages };
  }
  async submit(
    slug: string,
    operation: "report" | "transition",
    form: FormData,
  ) {
    const context = { ...(await this.context(slug)), source: "WEB" };
    const field = (key: string) => String(form.get(key) ?? "");
    if (operation === "report") {
      const parts = field("target").split(":");
      if (parts.length !== 2) throw new IncidentError("input");
      return this.services.incidents.report({
        ...context,
        targetKind: parts[0],
        targetId: parts[1],
        usageId: field("usageId") || null,
        description: field("description"),
        severity: field("severity"),
      });
    }
    if (operation !== "transition") throw new IncidentError("input");
    return this.services.incidents.transition({
      ...context,
      incidentId: field("incidentId"),
      next: field("next"),
      expectedVersion: Number(field("expectedVersion")),
      note: field("note"),
    });
  }
}
