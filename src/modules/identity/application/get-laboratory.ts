import { INITIAL_PERMISSIONS } from "../domain/access-catalog";
import { AuthorizationDeniedError } from "../domain/access-errors";
import type {
  AuthorizationGrant,
  AuthorizationService,
} from "./authorization-service";

export type LaboratoryView = {
  id: string;
  slug: string;
  name: string;
};

export interface LaboratoryReader {
  findActiveById(laboratoryId: string): Promise<LaboratoryView | null>;
}

export class GetLaboratory {
  constructor(
    private readonly authorization: AuthorizationService,
    private readonly laboratories: LaboratoryReader,
  ) {}

  async execute(input: {
    actorUserId: string;
    laboratoryId: string;
    additionalRestriction?: (
      grant: AuthorizationGrant,
    ) => boolean | Promise<boolean>;
  }): Promise<LaboratoryView> {
    await this.authorization.authorize({
      actorUserId: input.actorUserId,
      laboratoryId: input.laboratoryId,
      requiredPermission: INITIAL_PERMISSIONS.laboratoryRead.key,
      additionalRestriction: input.additionalRestriction,
    });

    const laboratory = await this.laboratories.findActiveById(
      input.laboratoryId,
    );

    if (!laboratory) throw new AuthorizationDeniedError();
    return laboratory;
  }
}
