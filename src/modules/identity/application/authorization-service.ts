import { AuthorizationDeniedError } from "../domain/access-errors";
import type { PermissionKey } from "../domain/access-catalog";

export type AuthorizationSnapshot = {
  actorUserId: string;
  laboratoryId: string;
  membershipId: string;
  userIsActive: boolean;
  laboratoryIsActive: boolean;
  membershipIsActive: boolean;
  roleKeys: readonly string[];
  permissionKeys: readonly string[];
};

export interface AuthorizationReader {
  readAuthorizationSnapshot(input: {
    actorUserId: string;
    laboratoryId: string;
  }): Promise<AuthorizationSnapshot | null>;
}

export type AuthorizationGrant = Pick<
  AuthorizationSnapshot,
  | "actorUserId"
  | "laboratoryId"
  | "membershipId"
  | "roleKeys"
  | "permissionKeys"
>;

export class AuthorizationService {
  constructor(private readonly reader: AuthorizationReader) {}

  async authorize(input: {
    actorUserId: string;
    laboratoryId: string;
    requiredPermission: PermissionKey;
    additionalRestriction?: (
      grant: AuthorizationGrant,
    ) => boolean | Promise<boolean>;
  }): Promise<AuthorizationGrant> {
    const snapshot = await this.reader.readAuthorizationSnapshot(input);

    if (
      !snapshot ||
      !snapshot.userIsActive ||
      !snapshot.laboratoryIsActive ||
      !snapshot.membershipIsActive ||
      !snapshot.permissionKeys.includes(input.requiredPermission)
    ) {
      throw new AuthorizationDeniedError();
    }

    const grant: AuthorizationGrant = {
      actorUserId: snapshot.actorUserId,
      laboratoryId: snapshot.laboratoryId,
      membershipId: snapshot.membershipId,
      roleKeys: snapshot.roleKeys,
      permissionKeys: snapshot.permissionKeys,
    };

    if (
      input.additionalRestriction &&
      !(await input.additionalRestriction(grant))
    ) {
      throw new AuthorizationDeniedError();
    }

    return grant;
  }
}
