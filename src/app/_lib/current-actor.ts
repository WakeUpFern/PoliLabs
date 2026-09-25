import "server-only";

import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  AuthenticationRequiredError,
  InactiveUserError,
} from "@/modules/identity/domain/access-errors";
import { auth } from "@/modules/identity/infrastructure/auth";
import { getCurrentUser } from "@/modules/identity/infrastructure/services";
import { resolveSessionActor } from "@/modules/identity/application/resolve-session-actor";

const readCurrentActor = cache(async () => {
  const session = await auth.api.getSession({ headers: await headers() });
  const actorUserId = resolveSessionActor(session);
  const user = await getCurrentUser.execute(actorUserId);
  return { actorUserId, user };
});

export async function requireCurrentActor() {
  try {
    return await readCurrentActor();
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      redirect("/login?reason=session-ended");
    }
    if (error instanceof InactiveUserError) {
      redirect("/login?reason=account-inactive");
    }
    throw error;
  }
}
