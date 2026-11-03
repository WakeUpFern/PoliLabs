export type MemberAdministrationErrorCode =
  | "input"
  | "role"
  | "self"
  | "exists"
  | "not-found"
  | "protected"
  | "shared-account";

/** Expected, user-correctable failures of laboratory member administration. */
export class MemberAdministrationError extends Error {
  constructor(readonly code: MemberAdministrationErrorCode) {
    super(`Member administration rejected: ${code}.`);
    this.name = "MemberAdministrationError";
  }
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_NAME_LENGTH = 120;
const MAX_EMAIL_LENGTH = 254;

export function memberValues(input: { name: string; email: string }) {
  const name = input.name.trim().replace(/\s+/g, " ");
  const email = input.email.trim().toLowerCase();
  if (!name || name.length > MAX_NAME_LENGTH)
    throw new MemberAdministrationError("input");
  if (email.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(email))
    throw new MemberAdministrationError("input");
  return { name, email };
}

/**
 * Permissions that only let a person act on their own records: their check-in,
 * their machine use, their loans, their reservations and reports. Granting
 * them gives no power over anybody else.
 */
export const SELF_SERVICE_PERMISSIONS: readonly string[] = [
  "academic.read",
  "attendance.read",
  "attendance.checkin",
  "usage.read",
  "usage.record",
  "inventory.loan.read",
  "incident.create",
  "incident.read",
  "reservation.read",
  "reservation.create",
  "reservation.cancel",
];

/**
 * Nobody hands out or manages more authority than they hold: a role is
 * assignable, and a member manageable, only when each of its permissions that
 * reaches beyond the person's own records is also held by the actor in that
 * laboratory. A teacher can therefore enrol students and other teachers but
 * cannot create or take over a responsible, without hard-coding role names.
 */
export function withinActorPermissions(
  actorPermissions: readonly string[],
  targetPermissions: readonly string[],
) {
  const held = new Set(actorPermissions);
  return targetPermissions.every(
    (permission) =>
      held.has(permission) || SELF_SERVICE_PERMISSIONS.includes(permission),
  );
}

// Lowercase without l/o and digits without 0/1: temporary passwords are read
// aloud or copied from a screen. 32 symbols, so `byte % 32` is unbiased.
const TEMPORARY_ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";
const TEMPORARY_GROUPS = 4;
const TEMPORARY_GROUP_LENGTH = 5;
export const TEMPORARY_PASSWORD_BYTES =
  TEMPORARY_GROUPS * TEMPORARY_GROUP_LENGTH;

/** Formats random bytes as e.g. `k7mpq-3xr9t-h2wne-8fzsc` (23 characters). */
export function formatTemporaryPassword(bytes: Uint8Array) {
  if (bytes.length < TEMPORARY_PASSWORD_BYTES)
    throw new Error("Not enough random bytes for a temporary password.");
  const groups: string[] = [];
  for (let group = 0; group < TEMPORARY_GROUPS; group += 1) {
    let text = "";
    for (let index = 0; index < TEMPORARY_GROUP_LENGTH; index += 1) {
      const byte = bytes[group * TEMPORARY_GROUP_LENGTH + index];
      text += TEMPORARY_ALPHABET[byte % TEMPORARY_ALPHABET.length];
    }
    groups.push(text);
  }
  return groups.join("-");
}

/**
 * A temporary password stays pending until the credential changes after it
 * was issued; changing the password is the only way to satisfy it.
 */
export function passwordChangePending(input: {
  temporaryPasswordIssuedAt: Date | null;
  credentialUpdatedAt: Date | null;
}) {
  if (!input.temporaryPasswordIssuedAt) return false;
  if (!input.credentialUpdatedAt) return true;
  return (
    input.credentialUpdatedAt.getTime() <=
    input.temporaryPasswordIssuedAt.getTime()
  );
}
