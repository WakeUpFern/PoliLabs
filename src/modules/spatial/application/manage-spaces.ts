import type { AuthorizationService } from "@/modules/identity/application/authorization-service";
import { INITIAL_PERMISSIONS } from "@/modules/identity/domain/access-catalog";
import { AuthorizationDeniedError } from "@/modules/identity/domain/access-errors";
import {
  DuplicateSpaceSlugError,
  normalizeSpaceInput,
  SpaceNotFoundError,
} from "../domain/space";
import type { SpaceWriter } from "./space-repository";

type WriteInput = {
  actorUserId: string;
  laboratoryId: string;
  name: string;
  slug: string;
  capacity?: number | null;
};

async function authorizeManage(
  authorization: AuthorizationService,
  input: Pick<WriteInput, "actorUserId" | "laboratoryId">,
) {
  await authorization.authorize({
    ...input,
    requiredPermission: INITIAL_PERMISSIONS.spaceManage.key,
  });
}

function throwWriteFailure(status: string): never {
  if (status === "unauthorized") throw new AuthorizationDeniedError();
  if (status === "duplicate") throw new DuplicateSpaceSlugError();
  throw new SpaceNotFoundError();
}

export class CreateSpace {
  constructor(
    private readonly authorization: AuthorizationService,
    private readonly spaces: SpaceWriter,
  ) {}

  async execute(input: WriteInput) {
    const values = normalizeSpaceInput(input);
    await authorizeManage(this.authorization, input);
    const result = await this.spaces.create({ ...input, ...values });
    if (result.status !== "created") throwWriteFailure(result.status);
    return result.space;
  }
}

export class UpdateSpace {
  constructor(
    private readonly authorization: AuthorizationService,
    private readonly spaces: SpaceWriter,
  ) {}

  async execute(input: WriteInput & { currentSlug: string }) {
    const values = normalizeSpaceInput(input);
    await authorizeManage(this.authorization, input);
    const result = await this.spaces.update({ ...input, ...values });
    if (result.status !== "updated") throwWriteFailure(result.status);
    return result.space;
  }
}

export class DeactivateSpace {
  constructor(
    private readonly authorization: AuthorizationService,
    private readonly spaces: SpaceWriter,
  ) {}

  async execute(input: {
    actorUserId: string;
    laboratoryId: string;
    slug: string;
  }) {
    await authorizeManage(this.authorization, input);
    const result = await this.spaces.deactivate(input);
    if (result.status !== "deactivated") throwWriteFailure(result.status);
  }
}
