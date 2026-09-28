import type { AuthorizationService } from "@/modules/identity/application/authorization-service";
import { INITIAL_PERMISSIONS } from "@/modules/identity/domain/access-catalog";
import { AuthorizationDeniedError } from "@/modules/identity/domain/access-errors";
import {
  InvalidLocationParentError,
  LocationCycleError,
  LocationHasActiveDependentsError,
  LocationNotFoundError,
  normalizeLocationInput,
} from "../domain/location";
import type {
  LocationWriter,
  LocationWriteResult,
} from "./spatial-organization-repository";
import { isSpatialId } from "../domain/spatial-id";

type LocationInput = {
  actorUserId: string;
  laboratoryId: string;
  spaceId: string;
  name: string;
  parentId?: string | null;
};

function throwLocationFailure(status: LocationWriteResult["status"]): never {
  if (status === "unauthorized") throw new AuthorizationDeniedError();
  if (status === "invalid-parent") throw new InvalidLocationParentError();
  if (status === "cycle") throw new LocationCycleError();
  if (status === "has-active-dependents")
    throw new LocationHasActiveDependentsError();
  throw new LocationNotFoundError();
}

async function authorize(
  authorization: AuthorizationService,
  input: Pick<LocationInput, "actorUserId" | "laboratoryId">,
) {
  await authorization.authorize({
    ...input,
    requiredPermission: INITIAL_PERMISSIONS.locationManage.key,
  });
}

export class CreateLocation {
  constructor(
    private readonly authorization: AuthorizationService,
    private readonly repository: LocationWriter,
  ) {}

  async execute(input: LocationInput) {
    const values = normalizeLocationInput(input);
    await authorize(this.authorization, input);
    const result = await this.repository.createLocation({
      ...input,
      ...values,
      requiredPermission: INITIAL_PERMISSIONS.locationManage.key,
    });
    if (result.status !== "created") throwLocationFailure(result.status);
    return result.location;
  }
}

export class UpdateLocation {
  constructor(
    private readonly authorization: AuthorizationService,
    private readonly repository: LocationWriter,
  ) {}

  async execute(input: LocationInput & { locationId: string }) {
    if (!isSpatialId(input.locationId)) throw new LocationNotFoundError();
    const values = normalizeLocationInput(input);
    await authorize(this.authorization, input);
    const result = await this.repository.updateLocation({
      ...input,
      ...values,
      requiredPermission: INITIAL_PERMISSIONS.locationManage.key,
    });
    if (result.status !== "updated") throwLocationFailure(result.status);
    return result.location;
  }
}

export class DeactivateLocation {
  constructor(
    private readonly authorization: AuthorizationService,
    private readonly repository: LocationWriter,
  ) {}

  async execute(
    input: Omit<LocationInput, "name" | "parentId"> & { locationId: string },
  ) {
    if (!isSpatialId(input.locationId)) throw new LocationNotFoundError();
    await authorize(this.authorization, input);
    const result = await this.repository.deactivateLocation({
      ...input,
      requiredPermission: INITIAL_PERMISSIONS.locationManage.key,
    });
    if (result.status !== "deactivated") throwLocationFailure(result.status);
  }
}
