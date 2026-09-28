import type { AuthorizationService } from "@/modules/identity/application/authorization-service";
import { INITIAL_PERMISSIONS } from "@/modules/identity/domain/access-catalog";
import type { ResourceReader } from "./spatial-organization-repository";

export class ListResources {
  constructor(
    private readonly authorization: AuthorizationService,
    private readonly resources: ResourceReader,
  ) {}

  async execute(input: {
    actorUserId: string;
    laboratoryId: string;
    spaceId: string;
  }) {
    const grant = await this.authorization.authorize({
      actorUserId: input.actorUserId,
      laboratoryId: input.laboratoryId,
      requiredPermission: INITIAL_PERMISSIONS.resourceRead.key,
    });
    return {
      resources: await this.resources.listActiveResources(input),
      canManage: grant.permissionKeys.includes(
        INITIAL_PERMISSIONS.resourceManage.key,
      ),
    };
  }
}
