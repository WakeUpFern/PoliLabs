import type { BetterAuthOptions } from "better-auth";

const TWELVE_HOURS_IN_SECONDS = 60 * 60 * 12;

export const authOptions = {
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    minPasswordLength: 15,
    maxPasswordLength: 128,
  },
  session: {
    expiresIn: TWELVE_HOURS_IN_SECONDS,
    disableSessionRefresh: true,
  },
  user: {
    additionalFields: {
      isActive: {
        type: "boolean",
        required: true,
        defaultValue: true,
        input: false,
      },
      // Set when staff issue a temporary password (ADR 0022); the change stays
      // pending until the credential is updated after this instant.
      temporaryPasswordIssuedAt: {
        type: "date",
        required: false,
        input: false,
        returned: false,
      },
    },
    deleteUser: {
      enabled: false,
    },
  },
  advanced: {
    cookiePrefix: "labora",
    database: {
      generateId: "uuid",
    },
  },
} satisfies BetterAuthOptions;
