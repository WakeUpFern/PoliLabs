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
import { ListLocations } from "../application/list-locations";
import { ListResources } from "../application/list-resources";
import {
  CreateLocation,
  DeactivateLocation,
  UpdateLocation,
} from "../application/manage-locations";
import {
  CreateResource,
  DeactivateResource,
  UpdateResource,
} from "../application/manage-resources";
import { DrizzleSpatialOrganizationRepository } from "./spatial-organization-repository";

const database = getDatabase();
const authorization = new AuthorizationService(
  new DrizzleAuthorizationReader(database),
);
const spaces = new DrizzleSpaceRepository(database);
const organization = new DrizzleSpatialOrganizationRepository(database);

export const listSpaces = new ListSpaces(authorization, spaces);
export const getSpace = new GetSpace(authorization, spaces);
export const createSpace = new CreateSpace(authorization, spaces);
export const updateSpace = new UpdateSpace(authorization, spaces);
export const deactivateSpace = new DeactivateSpace(authorization, spaces);
export const listLocations = new ListLocations(authorization, organization);
export const createLocation = new CreateLocation(authorization, organization);
export const updateLocation = new UpdateLocation(authorization, organization);
export const deactivateLocation = new DeactivateLocation(
  authorization,
  organization,
);
export const listResources = new ListResources(authorization, organization);
export const createResource = new CreateResource(authorization, organization);
export const updateResource = new UpdateResource(authorization, organization);
export const deactivateResource = new DeactivateResource(
  authorization,
  organization,
);
