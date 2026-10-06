import type { UsageService } from "../application/usage";
import type { GetLaboratoryBySlug } from "@/modules/identity/application/get-laboratory-by-slug";
import { UsageError } from "../domain/usage";
import { AuthorizationDeniedError } from "@/modules/identity/domain/access-errors";
export type UsageActionState = {
  status: "idle" | "success" | "error";
  message: string;
};
export function usageActionError(error: unknown): UsageActionState {
  if (error instanceof AuthorizationDeniedError)
    return {
      status: "error",
      message: "No tienes permiso para registrar o consultar estos usos.",
    };
  if (error instanceof UsageError)
    return {
      status: "error",
      message: {
        input: "Selecciona un contexto y recurso válidos.",
        "not-found": "El uso o contexto no está disponible.",
        state:
          "La sesión debe estar abierta o la reserva confirmada debe estar dentro de su horario.",
        relation:
          "El recurso debe estar activo y pertenecer al contexto seleccionado.",
        conflict:
          "Ya tienes un uso activo de este recurso en otro contexto. Termínalo antes de iniciar otro.",
      }[error.code],
    };
  throw error;
}
export class UsageWeb {
  constructor(
    private readonly services: {
      currentActor: () => Promise<{ actorUserId: string }>;
      laboratory: Pick<GetLaboratoryBySlug, "execute">;
      usage: UsageService;
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
  async page(slug: string) {
    const context = await this.context(slug);
    const [options, history] = await Promise.all([
      this.services.usage.options(context),
      this.services.usage.mine(context),
    ]);
    return { options, history };
  }
  async trace(slug: string, resourceId: string) {
    return this.services.usage.trace({
      ...(await this.context(slug)),
      resourceId,
    });
  }
  async submit(slug: string, operation: "start" | "finish", form: FormData) {
    const input = { ...(await this.context(slug)), source: "WEB" };
    if (operation === "finish")
      return this.services.usage.finish({
        ...input,
        usageId: String(form.get("usageId") ?? ""),
      });
    if (operation !== "start") throw new UsageError("input");
    const parts = String(form.get("selection") ?? "").split(":");
    if (parts.length !== 3) throw new UsageError("input");
    const [kind, contextId, resourceId] = parts;
    return this.services.usage.start({ ...input, kind, contextId, resourceId });
  }
}
