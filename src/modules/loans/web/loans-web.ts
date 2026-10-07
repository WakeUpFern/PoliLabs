import type { GetLaboratoryBySlug } from "@/modules/identity/application/get-laboratory-by-slug";
import { AuthorizationDeniedError } from "@/modules/identity/domain/access-errors";
import { localToInstant } from "@/modules/academic/web/time";
import { AcademicError } from "@/modules/academic/domain/academic";
import type { LoanService } from "../application/loans";
import { LoanError } from "../domain/loans";
export type LoanActionState = {
  status: "idle" | "success" | "error";
  message: string;
};
export const RETURN_CONDITION_LABELS = {
  good: "En buen estado",
  damaged: "Con daño",
  lost: "Perdida",
} as const;
export function loanActionError(error: unknown): LoanActionState {
  if (error instanceof AuthorizationDeniedError)
    return {
      status: "error",
      message: "No tienes permiso para realizar esta operación.",
    };
  if (error instanceof LoanError)
    return {
      status: "error",
      message: {
        input:
          "Revisa los datos: cantidad entera de piezas, fecha compromiso futura y notas de hasta 1000 caracteres (obligatorias con daño o pérdida).",
        "not-found":
          "El artículo o préstamo no está disponible en este laboratorio.",
        tool: "Sólo se prestan herramientas reutilizables activas.",
        borrower:
          "La persona seleccionada debe ser miembro activo del laboratorio.",
        session:
          "La sesión debe pertenecer al laboratorio y estar programada o abierta.",
        unavailable:
          "No hay suficientes unidades disponibles. La disponibilidad pudo cambiar; consulta el detalle y vuelve a intentarlo.",
        closed: "El préstamo ya fue devuelto por completo.",
        "excess-return":
          "La cantidad supera las unidades pendientes del préstamo.",
      }[error.code],
    };
  throw error;
}
export class LoansWeb {
  constructor(
    private readonly services: {
      currentActor: () => Promise<{ actorUserId: string }>;
      laboratory: Pick<GetLaboratoryBySlug, "execute">;
      loans: LoanService;
    },
  ) {}
  private async context(slug: string) {
    const { actorUserId } = await this.services.currentActor();
    const lab = await this.services.laboratory.execute({
      actorUserId,
      laboratorySlug: slug,
    });
    return { actorUserId, laboratoryId: lab.id };
  }
  async access(slug: string) {
    return this.services.loans.access(await this.context(slug));
  }
  async item(slug: string, itemId: string) {
    const context = await this.context(slug);
    const [access, data] = await Promise.all([
      this.services.loans.access(context),
      this.services.loans.itemLoans({ ...context, itemId }),
    ]);
    const lendable =
      access.canManage &&
      data.summary.isActive &&
      data.summary.itemType === "reusable_tool";
    return {
      ...data,
      access,
      options: lendable ? await this.services.loans.options(context) : null,
    };
  }
  async page(slug: string, filter: string | null) {
    const context = await this.context(slug);
    const access = await this.services.loans.access(context);
    if (!access.canManage && !access.canReadOwn)
      throw new AuthorizationDeniedError();
    const [laboratory, own] = await Promise.all([
      access.canManage
        ? this.services.loans.laboratoryLoans({ ...context, filter })
        : null,
      access.canReadOwn ? this.services.loans.ownLoans(context) : null,
    ]);
    return { access, laboratory, own };
  }
  async lend(slug: string, itemId: string, form: FormData) {
    const context = await this.context(slug);
    const field = (key: string) => String(form.get(key) ?? "");
    let dueAt: string | null = null;
    try {
      // The form states America/Mexico_City wall time; services receive offsets.
      if (field("dueLocal")) dueAt = localToInstant(field("dueLocal"));
    } catch (error) {
      if (error instanceof AcademicError) throw new LoanError("input");
      throw error;
    }
    return this.services.loans.lend({
      ...context,
      source: "WEB",
      itemId,
      borrowerUserId: field("borrowerUserId"),
      quantity: field("quantity"),
      dueAt,
      sessionId: field("sessionId") || null,
      notes: field("notes") || null,
    });
  }
  async registerReturn(slug: string, form: FormData) {
    const context = await this.context(slug);
    const field = (key: string) => String(form.get(key) ?? "");
    return this.services.loans.registerReturn({
      ...context,
      source: "WEB",
      loanId: field("loanId"),
      quantity: field("quantity"),
      condition: field("condition"),
      notes: field("notes") || null,
    });
  }
}
