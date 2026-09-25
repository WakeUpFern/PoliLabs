import "server-only";

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { getDatabase } from "@/infrastructure/database/client";
import { authOptions } from "./auth-options";
import * as authSchema from "./auth-schema";

export const auth = betterAuth({
  ...authOptions,
  database: drizzleAdapter(getDatabase(), {
    provider: "pg",
    schema: authSchema,
    usePlural: true,
  }),
});
