import type { GetLaboratoryBySlug } from "@/modules/identity/application/get-laboratory-by-slug";
import { AuthorizationDeniedError } from "@/modules/identity/domain/access-errors";
import { localToInstant } from "@/modules/academic/web/time";
import { AcademicError } from "@/modules/academic/domain/academic";
import type { MaintenanceService } from "../application/maintenance";
import { MaintenanceError } from "../domain/maintenance";
export type MaintenanceActionState = {
  status: "idle" | "success" | "error";
  message: string;
};
export function maintenanceActionError(error: unknown): MaintenanceActionState {
  if (error instanceof AuthorizationDeniedError)
    return {
      status: "error",
      message: "No tienes permiso para realizar esta operación.",
    };
  if (error instanceof MaintenanceError)
    return {
      status: "error",
      message: {
        input:
          "Revisa tipo, estado, fecha de realización (no futura), próxima fecha y descripción (máximo 5000 caracteres). Las cantidades admiten hasta tres decimales.",
        "not-found":
          "El recurso no está activo o no está disponible para tu cuenta.",
        relation:
          "La incidencia seleccionada debe corresponder a este recurso.",
        material:
          "Los materiales deben ser consumibles activos del laboratorio; las piezas sólo admiten cantidades enteras.",
        "insufficient-stock":
          "Existencia insuficiente para algún material. No se guardó la entrada ni se modificó el inventario.",
      }[error.code],
    };
  throw error;
}
export class MaintenanceWeb {
  constructor(
    private readonly services: {
      currentActor: () => Promise<{ actorUserId: string }>;
      laboratory: Pick<GetLaboratoryBySlug, "execute">;
      maintenance: MaintenanceService;
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
    return this.services.maintenance.access(await this.context(slug));
  }
  async page(slug: string) {
    const context = await this.context(slug);
    const [access, resources] = await Promise.all([
      this.services.maintenance.access(context),
      this.services.maintenance.resources(context),
    ]);
    return { access, resources };
  }
  async detail(slug: string, resourceId: string) {
    const context = await this.context(slug);
    const input = { ...context, resourceId };
    const [access, data] = await Promise.all([
      this.services.maintenance.access(context),
      this.services.maintenance.detail(input),
    ]);
    const options = access.canCreate
      ? await this.services.maintenance.options(input)
      : null;
    return { ...data, access, options };
  }
  async record(slug: string, resourceId: string, form: FormData) {
    const context = await this.context(slug);
    const field = (key: string) => String(form.get(key) ?? "");
    let performedAt: string;
    try {
      // The form states America/Mexico_City wall time; services receive offsets.
      performedAt = localToInstant(field("performedLocal"));
    } catch (error) {
      if (error instanceof AcademicError) throw new MaintenanceError("input");
      throw error;
    }
    const itemIds = form.getAll("materialItemId").map(String);
    const quantities = form.getAll("materialQuantity").map(String);
    if (itemIds.length !== quantities.length)
      throw new MaintenanceError("input");
    const materials = itemIds
      .map((itemId, i) => ({ itemId, quantity: quantities[i] }))
      .filter((m) => m.itemId || m.quantity);
    return this.services.maintenance.record({
      ...context,
      source: "WEB",
      resourceId,
      type: field("type"),
      statusAfter: field("statusAfter"),
      description: field("description"),
      performedAt,
      nextDueOn: field("nextDueOn") || null,
      incidentId: field("incidentId") || null,
      materials,
    });
  }
}
