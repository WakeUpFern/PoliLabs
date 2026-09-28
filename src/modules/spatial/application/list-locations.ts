import type { AuthorizationService } from "@/modules/identity/application/authorization-service";
import { INITIAL_PERMISSIONS } from "@/modules/identity/domain/access-catalog";
import type { LocationReader } from "./spatial-organization-repository";

export class ListLocations {
  constructor(
    private readonly authorization: AuthorizationService,
    private readonly locations: LocationReader,
  ) {}

  async execute(input: {
    actorUserId: string;
    laboratoryId: string;
    spaceId: string;
  }) {
    const grant = await this.authorization.authorize({
      actorUserId: input.actorUserId,
      laboratoryId: input.laboratoryId,
      requiredPermission: INITIAL_PERMISSIONS.locationRead.key,
    });
    return {
      locations: await this.locations.listActiveLocations(input),
      canManage: grant.permissionKeys.includes(
        INITIAL_PERMISSIONS.locationManage.key,
      ),
    };
  }
}
