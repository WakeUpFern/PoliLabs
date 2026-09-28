import type { AuthorizationService } from "@/modules/identity/application/authorization-service";
import { INITIAL_PERMISSIONS } from "@/modules/identity/domain/access-catalog";
import type { SpaceReader } from "./space-repository";

export class ListSpaces {
  constructor(
    private readonly authorization: AuthorizationService,
    private readonly spaces: SpaceReader,
  ) {}

  async execute(input: { actorUserId: string; laboratoryId: string }) {
    const grant = await this.authorization.authorize({
      ...input,
      requiredPermission: INITIAL_PERMISSIONS.spaceRead.key,
    });
    const spaces = await this.spaces.listActive(input.laboratoryId);

    return {
      spaces,
      canManage: grant.permissionKeys.includes(
        INITIAL_PERMISSIONS.spaceManage.key,
      ),
    };
  }
}
