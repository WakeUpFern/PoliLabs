import { AuthenticationRequiredError } from "../domain/access-errors";

export type AuthenticationSession = {
  user?: { id?: string } | null;
} | null;

export function resolveSessionActor(session: AuthenticationSession): string {
  const actorUserId = session?.user?.id;
  if (!actorUserId) throw new AuthenticationRequiredError();
  return actorUserId;
}
