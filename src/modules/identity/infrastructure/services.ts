import "server-only";

import { GetCurrentUser } from "../application/get-current-user";
import { GetLaboratoryBySlug } from "../application/get-laboratory-by-slug";
import { GetUserLaboratories } from "../application/get-user-laboratories";
import { AuthorizationService } from "../application/authorization-service";
import { MemberAdministration } from "../application/member-administration";
import { getDatabase } from "@/infrastructure/database/client";
import {
  DrizzleActiveUserReader,
  DrizzleAuthorizationReader,
  DrizzleLaboratoryReader,
  DrizzleUserLaboratoriesReader,
} from "./access-repository";
import {
  DrizzleMemberAdministrationStore,
  readPasswordChangePending,
  temporaryPasswords,
} from "./member-administration-store";

const database = getDatabase();
const laboratoryReader = new DrizzleLaboratoryReader(database);
const authorization = new AuthorizationService(
  new DrizzleAuthorizationReader(database),
);

export const getCurrentUser = new GetCurrentUser(
  new DrizzleActiveUserReader(database),
);
export const getUserLaboratories = new GetUserLaboratories(
  new DrizzleUserLaboratoriesReader(database),
);
export const getLaboratoryBySlug = new GetLaboratoryBySlug(
  authorization,
  laboratoryReader,
);

export const memberAdministration = new MemberAdministration(
  new DrizzleMemberAdministrationStore(database),
  temporaryPasswords,
);

export function passwordChangePendingFor(userId: string) {
  return readPasswordChangePending(database, userId);
}
