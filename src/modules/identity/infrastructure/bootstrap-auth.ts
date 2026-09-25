import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import type { LocalIdentityProvisioner } from "../application/bootstrap-installation";
import { authOptions } from "./auth-options";
import type { IdentityDatabase } from "./access-repository";
import * as authSchema from "./auth-schema";

export function createBootstrapAuth(database: IdentityDatabase) {
  return betterAuth({
    ...authOptions,
    baseURL: "http://localhost:3000",
    emailAndPassword: {
      ...authOptions.emailAndPassword,
      disableSignUp: false,
      autoSignIn: false,
    },
    database: drizzleAdapter(database, {
      provider: "pg",
      schema: authSchema,
      usePlural: true,
    }),
  });
}

export class BetterAuthLocalIdentityProvisioner implements LocalIdentityProvisioner {
  constructor(
    private readonly bootstrapAuth: ReturnType<typeof createBootstrapAuth>,
  ) {}

  async createLocalIdentity(input: {
    name: string;
    email: string;
    password: string;
  }) {
    const result = await this.bootstrapAuth.api.signUpEmail({ body: input });
    return { userId: result.user.id };
  }
}
