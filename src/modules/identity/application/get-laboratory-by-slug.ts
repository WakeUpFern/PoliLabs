import { INITIAL_PERMISSIONS } from "../domain/access-catalog";
import { AuthorizationDeniedError } from "../domain/access-errors";
import type { AuthorizationService } from "./authorization-service";

export type LaboratoryContext = {
  id: string;
  slug: string;
  name: string;
  roleKeys: readonly string[];
};

export interface LaboratorySlugReader {
  findActiveBySlug(slug: string): Promise<{
    id: string;
    slug: string;
    name: string;
  } | null>;
}

export class GetLaboratoryBySlug {
  constructor(
    private readonly authorization: AuthorizationService,
    private readonly laboratories: LaboratorySlugReader,
  ) {}

  async execute(input: {
    actorUserId: string;
    laboratorySlug: string;
  }): Promise<LaboratoryContext> {
    const laboratory = await this.laboratories.findActiveBySlug(
      input.laboratorySlug,
    );
    if (!laboratory) throw new AuthorizationDeniedError();

    const grant = await this.authorization.authorize({
      actorUserId: input.actorUserId,
      laboratoryId: laboratory.id,
      requiredPermission: INITIAL_PERMISSIONS.laboratoryRead.key,
    });

    return { ...laboratory, roleKeys: grant.roleKeys };
  }
}
