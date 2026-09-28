import type { AuthorizationService } from "@/modules/identity/application/authorization-service";
import { INITIAL_PERMISSIONS } from "@/modules/identity/domain/access-catalog";
import { AuthorizationDeniedError } from "@/modules/identity/domain/access-errors";
import {
  InvalidResourceLocationError,
  normalizeResourceInput,
  ResourceNotFoundError,
} from "../domain/resource";
import type {
  ResourceWriter,
  ResourceWriteResult,
} from "./spatial-organization-repository";
import { isSpatialId } from "../domain/spatial-id";

type ResourceInput = {
  actorUserId: string;
  laboratoryId: string;
  spaceId: string;
  name: string;
  locationId?: string | null;
};

function throwResourceFailure(status: ResourceWriteResult["status"]): never {
  if (status === "unauthorized") throw new AuthorizationDeniedError();
  if (status === "invalid-location") throw new InvalidResourceLocationError();
  throw new ResourceNotFoundError();
}

async function authorize(
  authorization: AuthorizationService,
  input: Pick<ResourceInput, "actorUserId" | "laboratoryId">,
) {
  await authorization.authorize({
    ...input,
    requiredPermission: INITIAL_PERMISSIONS.resourceManage.key,
  });
}

export class CreateResource {
  constructor(
    private readonly authorization: AuthorizationService,
    private readonly repository: ResourceWriter,
  ) {}

  async execute(input: ResourceInput) {
    const values = normalizeResourceInput(input);
    await authorize(this.authorization, input);
    const result = await this.repository.createResource({
      ...input,
      ...values,
      requiredPermission: INITIAL_PERMISSIONS.resourceManage.key,
    });
    if (result.status !== "created") throwResourceFailure(result.status);
    return result.resource;
  }
}

export class UpdateResource {
  constructor(
    private readonly authorization: AuthorizationService,
    private readonly repository: ResourceWriter,
  ) {}

  async execute(input: ResourceInput & { resourceId: string }) {
    if (!isSpatialId(input.resourceId)) throw new ResourceNotFoundError();
    const values = normalizeResourceInput(input);
    await authorize(this.authorization, input);
    const result = await this.repository.updateResource({
      ...input,
      ...values,
      requiredPermission: INITIAL_PERMISSIONS.resourceManage.key,
    });
    if (result.status !== "updated") throwResourceFailure(result.status);
    return result.resource;
  }
}

export class DeactivateResource {
  constructor(
    private readonly authorization: AuthorizationService,
    private readonly repository: ResourceWriter,
  ) {}

  async execute(
    input: Omit<ResourceInput, "name" | "locationId"> & {
      resourceId: string;
    },
  ) {
    if (!isSpatialId(input.resourceId)) throw new ResourceNotFoundError();
    await authorize(this.authorization, input);
    const result = await this.repository.deactivateResource({
      ...input,
      requiredPermission: INITIAL_PERMISSIONS.resourceManage.key,
    });
    if (result.status !== "deactivated") throwResourceFailure(result.status);
  }
}
