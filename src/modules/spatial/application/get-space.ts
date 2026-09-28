import type { AuthorizationService } from "@/modules/identity/application/authorization-service";
import { INITIAL_PERMISSIONS } from "@/modules/identity/domain/access-catalog";
import { SpaceNotFoundError } from "../domain/space";
import type { SpaceReader } from "./space-repository";

export class GetSpace {
  constructor(
    private readonly authorization: AuthorizationService,
    private readonly spaces: SpaceReader,
  ) {}

  async execute(input: {
    actorUserId: string;
    laboratoryId: string;
    slug: string;
  }) {
    await this.authorization.authorize({
      actorUserId: input.actorUserId,
      laboratoryId: input.laboratoryId,
      requiredPermission: INITIAL_PERMISSIONS.spaceRead.key,
    });
    const space = await this.spaces.findActiveBySlug(input);
    if (!space) throw new SpaceNotFoundError();
    return space;
  }
}
