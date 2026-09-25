import { INITIAL_PERMISSIONS } from "../domain/access-catalog";
import {
  AuthorizationDeniedError,
  DuplicateMembershipRoleError,
  InvalidLaboratoryRelationError,
} from "../domain/access-errors";
import type { AuthorizationService } from "./authorization-service";

export interface MembershipRoleAssigner {
  assignRole(input: {
    actorUserId: string;
    laboratoryId: string;
    membershipId: string;
    roleKey: string;
  }): Promise<"assigned" | "duplicate" | "invalid-relation" | "unauthorized">;
}

export class AssignMembershipRole {
  constructor(
    private readonly authorization: AuthorizationService,
    private readonly roleAssigner: MembershipRoleAssigner,
  ) {}

  async execute(input: {
    actorUserId: string;
    laboratoryId: string;
    membershipId: string;
    roleKey: string;
  }): Promise<void> {
    await this.authorization.authorize({
      actorUserId: input.actorUserId,
      laboratoryId: input.laboratoryId,
      requiredPermission: INITIAL_PERMISSIONS.laboratoryRoleAssign.key,
    });

    const result = await this.roleAssigner.assignRole(input);
    if (result === "unauthorized") throw new AuthorizationDeniedError();
    if (result === "duplicate") throw new DuplicateMembershipRoleError();
    if (result === "invalid-relation")
      throw new InvalidLaboratoryRelationError();
  }
}
