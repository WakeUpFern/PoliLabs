import type { PermissionKey } from "../domain/access-catalog";
import {
  MemberAdministrationError,
  memberValues,
  withinActorPermissions,
} from "../domain/member-administration";
import type { AuthorizationGrant } from "./authorization-service";

export type MemberContext = { actorUserId: string; laboratoryId: string };

export type MemberRecord = {
  membershipId: string;
  userId: string;
  name: string;
  email: string;
  isActive: boolean;
  userIsActive: boolean;
  roleKeys: readonly string[];
  roleNames: readonly string[];
  permissionKeys: readonly string[];
  passwordChangePending: boolean;
  otherActiveLaboratories: number;
};

export type RoleRecord = {
  id: string;
  key: string;
  name: string;
  description: string;
  permissionKeys: readonly string[];
};

export interface MemberTransaction {
  members(laboratoryId: string): Promise<MemberRecord[]>;
  member(
    laboratoryId: string,
    membershipId: string,
  ): Promise<MemberRecord | null>;
  roles(): Promise<RoleRecord[]>;
  findUserIdByEmail(email: string): Promise<string | null>;
  isMember(laboratoryId: string, userId: string): Promise<boolean>;
  createLocalUser(input: {
    name: string;
    email: string;
    passwordHash: string;
  }): Promise<string>;
  addMembership(input: {
    laboratoryId: string;
    userId: string;
    roleId: string;
  }): Promise<string>;
  replaceRoles(membershipId: string, roleId: string): Promise<void>;
  setMembershipActive(membershipId: string, active: boolean): Promise<void>;
  setTemporaryPassword(userId: string, passwordHash: string): Promise<void>;
}

export interface MemberAdministrationStore {
  run<T>(
    context: MemberContext,
    permission: PermissionKey,
    work: (tx: MemberTransaction, grant: AuthorizationGrant) => Promise<T>,
  ): Promise<T>;
}

export interface TemporaryPasswords {
  generate(): string;
  hash(password: string): Promise<string>;
}

export type MemberView = MemberRecord & {
  isSelf: boolean;
  /** The actor may change roles, deactivate or reset this member. */
  canManage: boolean;
};

export type RoleOption = Omit<RoleRecord, "id" | "permissionKeys">;

/**
 * Laboratory member administration (SRS §23.1, §24, ADR 0022): authorized
 * staff create local accounts with a temporary password, assign a role from
 * the catalog, deactivate memberships and issue new temporary passwords.
 */
export class MemberAdministration {
  constructor(
    private readonly store: MemberAdministrationStore,
    private readonly passwords: TemporaryPasswords,
  ) {}

  overview(context: MemberContext) {
    return this.store.run(
      context,
      "laboratory.membership.manage",
      async (tx, grant) => {
        const [members, roles] = await Promise.all([
          tx.members(context.laboratoryId),
          tx.roles(),
        ]);
        return {
          members: members.map((member) => this.view(member, context, grant)),
          roles: assignable(roles, grant).map(roleOption),
          canAssignRoles: grant.permissionKeys.includes(
            "laboratory.role.assign",
          ),
        };
      },
    );
  }

  async create(
    context: MemberContext & { name: string; email: string; roleKey: string },
  ) {
    const values = memberValues(context);
    // Hash outside the transaction: it is deliberately slow.
    const temporaryPassword = this.passwords.generate();
    const passwordHash = await this.passwords.hash(temporaryPassword);
    return this.store.run(
      context,
      "laboratory.membership.manage",
      async (tx, grant) => {
        const role = await requireAssignableRole(tx, grant, context.roleKey);
        const existingUserId = await tx.findUserIdByEmail(values.email);
        if (existingUserId) {
          if (await tx.isMember(context.laboratoryId, existingUserId))
            throw new MemberAdministrationError("exists");
          // An existing account keeps its own password; only access is added.
          const membershipId = await tx.addMembership({
            laboratoryId: context.laboratoryId,
            userId: existingUserId,
            roleId: role.id,
          });
          return { membershipId, temporaryPassword: null };
        }
        const userId = await tx.createLocalUser({ ...values, passwordHash });
        const membershipId = await tx.addMembership({
          laboratoryId: context.laboratoryId,
          userId,
          roleId: role.id,
        });
        return { membershipId, temporaryPassword };
      },
    );
  }

  changeRole(
    context: MemberContext & { membershipId: string; roleKey: string },
  ) {
    return this.store.run(
      context,
      "laboratory.role.assign",
      async (tx, grant) => {
        await requireManageable(tx, grant, context);
        const role = await requireAssignableRole(tx, grant, context.roleKey);
        await tx.replaceRoles(context.membershipId, role.id);
      },
    );
  }

  setActive(
    context: MemberContext & { membershipId: string; active: boolean },
  ) {
    return this.store.run(
      context,
      "laboratory.membership.manage",
      async (tx, grant) => {
        await requireManageable(tx, grant, context);
        await tx.setMembershipActive(context.membershipId, context.active);
      },
    );
  }

  async resetPassword(context: MemberContext & { membershipId: string }) {
    const temporaryPassword = this.passwords.generate();
    const passwordHash = await this.passwords.hash(temporaryPassword);
    return this.store.run(
      context,
      "laboratory.membership.manage",
      async (tx, grant) => {
        const member = await requireManageable(tx, grant, context);
        // The account is global: staff of one laboratory must not take over
        // a person who also belongs to another one.
        if (member.otherActiveLaboratories > 0)
          throw new MemberAdministrationError("shared-account");
        await tx.setTemporaryPassword(member.userId, passwordHash);
        return { temporaryPassword };
      },
    );
  }

  private view(
    member: MemberRecord,
    context: MemberContext,
    grant: AuthorizationGrant,
  ): MemberView {
    const isSelf = member.userId === context.actorUserId;
    return {
      ...member,
      isSelf,
      canManage:
        !isSelf &&
        withinActorPermissions(grant.permissionKeys, member.permissionKeys),
    };
  }
}

function assignable(roles: RoleRecord[], grant: AuthorizationGrant) {
  return roles.filter(
    (role) =>
      role.permissionKeys.length > 0 &&
      withinActorPermissions(grant.permissionKeys, role.permissionKeys),
  );
}

function roleOption({ key, name, description }: RoleRecord): RoleOption {
  return { key, name, description };
}

async function requireAssignableRole(
  tx: MemberTransaction,
  grant: AuthorizationGrant,
  roleKey: string,
) {
  const role = assignable(await tx.roles(), grant).find(
    (candidate) => candidate.key === roleKey,
  );
  if (!role) throw new MemberAdministrationError("role");
  return role;
}

async function requireManageable(
  tx: MemberTransaction,
  grant: AuthorizationGrant,
  context: MemberContext & { membershipId: string },
) {
  const member = await tx.member(context.laboratoryId, context.membershipId);
  if (!member) throw new MemberAdministrationError("not-found");
  if (member.userId === context.actorUserId)
    throw new MemberAdministrationError("self");
  if (!withinActorPermissions(grant.permissionKeys, member.permissionKeys))
    throw new MemberAdministrationError("protected");
  return member;
}
