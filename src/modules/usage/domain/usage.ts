import { parseId, parseOneOf, SOURCES, type Source } from "@/shared/validation";
export type UsageContext = { actorUserId: string; laboratoryId: string };
export type UsageSource = Source;
export type UsageContextKind = "academic" | "reservation";
export class UsageError extends Error {
  constructor(
    public readonly code:
      "input" | "not-found" | "state" | "relation" | "conflict" | "unavailable",
  ) {
    super(`Usage rejected: ${code}`);
    this.name = "UsageError";
  }
}
export function usageId(value: string) {
  return parseId(value, () => new UsageError("input"));
}
export function usageSource(value: string): UsageSource {
  return parseOneOf(SOURCES, value, () => new UsageError("input"));
}
export function usageKind(value: string): UsageContextKind {
  if (value !== "academic" && value !== "reservation")
    throw new UsageError("input");
  return value;
}
export function requireUsageEligibility(
  input: {
    kind: UsageContextKind;
    status: string;
    isEligibleUser: boolean;
    startsAt: Date;
    endsAt: Date;
  },
  now: Date,
) {
  if (!input.isEligibleUser) throw new UsageError("not-found");
  if (
    input.kind === "academic"
      ? input.status !== "open"
      : input.status !== "confirmed" ||
        now < input.startsAt ||
        now >= input.endsAt
  )
    throw new UsageError("state");
}
export type ResourceUsage = {
  id: string;
  userId: string;
  resourceId: string;
  spaceId: string;
  sessionId: string | null;
  reservationId: string | null;
  startedAt: Date;
  endedAt: Date | null;
  createdAt: Date;
};
export type UsageOption = {
  kind: UsageContextKind;
  contextId: string;
  startsAt: Date;
  endsAt: Date;
  title: string;
  resourceId: string;
  resourceName: string;
};

export type UsageHistoryEntry = ResourceUsage & {
  userName: string;
  resourceName: string;
};
