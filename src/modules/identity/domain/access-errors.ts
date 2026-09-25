export class AuthorizationDeniedError extends Error {
  readonly code = "AUTHORIZATION_DENIED";

  constructor() {
    super("Operation is not authorized.");
    this.name = "AuthorizationDeniedError";
  }
}

export class DuplicateMembershipRoleError extends Error {
  readonly code = "DUPLICATE_MEMBERSHIP_ROLE";

  constructor() {
    super("The role is already assigned to this membership.");
    this.name = "DuplicateMembershipRoleError";
  }
}

export class InvalidLaboratoryRelationError extends Error {
  readonly code = "INVALID_LABORATORY_RELATION";

  constructor() {
    super("The requested relationship is not valid in this laboratory.");
    this.name = "InvalidLaboratoryRelationError";
  }
}

export class BootstrapAlreadyInitializedError extends Error {
  readonly code = "BOOTSTRAP_ALREADY_INITIALIZED";

  constructor() {
    super("This installation is not empty and cannot be bootstrapped.");
    this.name = "BootstrapAlreadyInitializedError";
  }
}

export class BootstrapInputError extends Error {
  readonly code = "INVALID_BOOTSTRAP_INPUT";

  constructor(message: string) {
    super(message);
    this.name = "BootstrapInputError";
  }
}
