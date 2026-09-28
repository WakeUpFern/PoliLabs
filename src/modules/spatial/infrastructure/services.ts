import "server-only";

import { AuthorizationService } from "@/modules/identity/application/authorization-service";
import { getDatabase } from "@/infrastructure/database/client";
import { DrizzleAuthorizationReader } from "@/modules/identity/infrastructure/access-repository";
import { GetSpace } from "../application/get-space";
import { ListSpaces } from "../application/list-spaces";
import {
  CreateSpace,
  DeactivateSpace,
  UpdateSpace,
} from "../application/manage-spaces";
import { DrizzleSpaceRepository } from "./space-repository";

const database = getDatabase();
const authorization = new AuthorizationService(
  new DrizzleAuthorizationReader(database),
);
const spaces = new DrizzleSpaceRepository(database);

export const listSpaces = new ListSpaces(authorization, spaces);
export const getSpace = new GetSpace(authorization, spaces);
export const createSpace = new CreateSpace(authorization, spaces);
export const updateSpace = new UpdateSpace(authorization, spaces);
export const deactivateSpace = new DeactivateSpace(authorization, spaces);
