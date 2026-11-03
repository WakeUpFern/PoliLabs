import { laboratoryContext } from "./laboratory-context";
import type { MemberAdministration } from "../application/member-administration";
import type { GetLaboratoryBySlug } from "../application/get-laboratory-by-slug";
import { AuthorizationDeniedError } from "../domain/access-errors";
import {
  MemberAdministrationError,
  type MemberAdministrationErrorCode,
} from "../domain/member-administration";

export type MemberActionState = {
  status: "idle" | "success" | "error";
  message: string;
  /** Shown once, right after it is issued; never stored or sent again. */
  temporaryPassword?: string;
  email?: string;
};

const MESSAGES: Record<MemberAdministrationErrorCode, string> = {
  input: "Escribe el nombre completo y un correo válido.",
  role: "Ese rol no está disponible para tu cuenta.",
  self: "No puedes cambiar tu propio acceso. Pide a otra persona responsable que lo haga.",
  exists: "Esa persona ya tiene acceso a este laboratorio.",
  "not-found": "No encontramos a esa persona en este laboratorio.",
  protected:
    "Esa persona tiene más permisos que tú. Sólo alguien con su mismo nivel puede cambiar su acceso.",
  "shared-account":
    "Esa cuenta también se usa en otro laboratorio. Pide a la persona responsable de la instalación que restablezca la contraseña.",
};

export function memberActionError(error: unknown): MemberActionState {
  if (error instanceof AuthorizationDeniedError)
    return {
      status: "error",
      message:
        "No tienes permiso para administrar personas en este laboratorio.",
    };
  if (error instanceof MemberAdministrationError)
    return { status: "error", message: MESSAGES[error.code] };
  throw error;
}

export class MembersWeb {
  constructor(
    private readonly services: {
      currentActor: () => Promise<{ actorUserId: string }>;
      laboratory: Pick<GetLaboratoryBySlug, "execute">;
      members: MemberAdministration;
    },
  ) {}

  private async context(slug: string) {
    return (await laboratoryContext(this.services, slug)).actor;
  }

  async overview(slug: string) {
    return this.services.members.overview(await this.context(slug));
  }

  async create(slug: string, form: FormData): Promise<MemberActionState> {
    const field = (key: string) => String(form.get(key) ?? "");
    try {
      const result = await this.services.members.create({
        ...(await this.context(slug)),
        name: field("name"),
        email: field("email"),
        roleKey: field("roleKey"),
      });
      const email = field("email").trim().toLowerCase();
      return result.temporaryPassword
        ? {
            status: "success",
            message: "Cuenta creada.",
            temporaryPassword: result.temporaryPassword,
            email,
          }
        : {
            status: "success",
            message:
              "Esa persona ya tenía cuenta: ahora también tiene acceso a este laboratorio con su contraseña de siempre.",
            email,
          };
    } catch (error) {
      return memberActionError(error);
    }
  }

  async changeRole(slug: string, form: FormData): Promise<MemberActionState> {
    try {
      await this.services.members.changeRole({
        ...(await this.context(slug)),
        membershipId: String(form.get("membershipId") ?? ""),
        roleKey: String(form.get("roleKey") ?? ""),
      });
      return { status: "success", message: "Rol actualizado." };
    } catch (error) {
      return memberActionError(error);
    }
  }

  async setActive(slug: string, form: FormData): Promise<MemberActionState> {
    const active = form.get("active") === "true";
    try {
      await this.services.members.setActive({
        ...(await this.context(slug)),
        membershipId: String(form.get("membershipId") ?? ""),
        active,
      });
      return {
        status: "success",
        message: active ? "Acceso reactivado." : "Acceso desactivado.",
      };
    } catch (error) {
      return memberActionError(error);
    }
  }

  async resetPassword(
    slug: string,
    form: FormData,
  ): Promise<MemberActionState> {
    try {
      const { temporaryPassword } = await this.services.members.resetPassword({
        ...(await this.context(slug)),
        membershipId: String(form.get("membershipId") ?? ""),
      });
      return {
        status: "success",
        message: "Nueva contraseña temporal lista.",
        temporaryPassword,
        email: String(form.get("email") ?? ""),
      };
    } catch (error) {
      return memberActionError(error);
    }
  }
}
