import { and, eq } from "drizzle-orm";
import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { authOptions } from "./auth-options";
import type { IdentityDatabase } from "./access-repository";
import * as authSchema from "./auth-schema";

export function createRuntimeAuth(
  database: IdentityDatabase,
  baseURL?: string,
) {
  return betterAuth({
    ...authOptions,
    ...(baseURL ? { baseURL } : {}),
    database: drizzleAdapter(database, {
      provider: "pg",
      schema: authSchema,
      usePlural: true,
    }),
    databaseHooks: {
      session: {
        create: {
          before: async (session) => {
            const [activeUser] = await database
              .select({ id: authSchema.users.id })
              .from(authSchema.users)
              .where(
                and(
                  eq(authSchema.users.id, session.userId),
                  eq(authSchema.users.isActive, true),
                ),
              )
              .limit(1);

            if (!activeUser) {
              throw new APIError("UNAUTHORIZED", {
                message: "Correo o contraseña incorrectos.",
              });
            }

            return { data: session };
          },
        },
      },
    },
  });
}
