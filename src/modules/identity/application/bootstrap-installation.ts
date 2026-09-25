import {
  INITIAL_PERMISSION_LIST,
  INITIAL_RESPONSIBLE_ROLE,
} from "../domain/access-catalog";
import { BootstrapInputError } from "../domain/access-errors";

export type BootstrapInput = {
  userName: string;
  userEmail: string;
  password: string;
  laboratoryName: string;
  laboratorySlug: string;
};

export type BootstrapResult = {
  userId: string;
  laboratoryId: string;
  membershipId: string;
  roleId: string;
};

export interface LocalIdentityProvisioner {
  createLocalIdentity(input: {
    name: string;
    email: string;
    password: string;
  }): Promise<{ userId: string }>;
}

export interface BootstrapCoordinator {
  initialize(
    input: {
      laboratoryName: string;
      laboratorySlug: string;
      role: typeof INITIAL_RESPONSIBLE_ROLE;
      permissions: typeof INITIAL_PERMISSION_LIST;
    },
    createIdentity: () => Promise<{ userId: string }>,
  ): Promise<BootstrapResult>;
}

export class BootstrapInstallation {
  constructor(
    private readonly identities: LocalIdentityProvisioner,
    private readonly coordinator: BootstrapCoordinator,
  ) {}

  async execute(input: BootstrapInput): Promise<BootstrapResult> {
    const userName = input.userName.trim();
    const userEmail = input.userEmail.trim().toLowerCase();
    const laboratoryName = input.laboratoryName.trim();
    const laboratorySlug = input.laboratorySlug.trim().toLowerCase();

    if (!userName || !userEmail || !laboratoryName)
      throw new BootstrapInputError(
        "Name, email and laboratory name are required.",
      );
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(laboratorySlug))
      throw new BootstrapInputError(
        "Laboratory slug must contain lowercase letters, numbers and hyphens.",
      );

    return this.coordinator.initialize(
      {
        laboratoryName,
        laboratorySlug,
        role: INITIAL_RESPONSIBLE_ROLE,
        permissions: INITIAL_PERMISSION_LIST,
      },
      () =>
        this.identities.createLocalIdentity({
          name: userName,
          email: userEmail,
          password: input.password,
        }),
    );
  }
}
