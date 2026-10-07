export type IncidentContext = { actorUserId: string; laboratoryId: string };
export type IncidentSource = "WEB" | "API" | "AGENT" | "SYSTEM";
export type IncidentTargetKind = "resource" | "space" | "session";
export type IncidentSeverity = "low" | "medium" | "high";
export type IncidentStatus = "open" | "in_review" | "resolved";
export type IncidentScope = "own" | "laboratory";
export class IncidentError extends Error {
  constructor(
    public readonly code:
      "input" | "not-found" | "relation" | "state" | "conflict",
  ) {
    super(`Incident rejected: ${code}`);
    this.name = "IncidentError";
  }
}
export function incidentId(value: string) {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
    throw new IncidentError("input");
  return value.toLowerCase();
}
export function incidentSource(value: string): IncidentSource {
  if (!["WEB", "API", "AGENT", "SYSTEM"].includes(value))
    throw new IncidentError("input");
  return value as IncidentSource;
}
export function incidentText(value: string, maximum = 5000) {
  const result = value.trim();
  if (!result || result.length > maximum) throw new IncidentError("input");
  return result;
}
export function incidentTargetKind(value: string): IncidentTargetKind {
  if (!["resource", "space", "session"].includes(value))
    throw new IncidentError("input");
  return value as IncidentTargetKind;
}
export function incidentSeverity(value: string): IncidentSeverity {
  if (!["low", "medium", "high"].includes(value))
    throw new IncidentError("input");
  return value as IncidentSeverity;
}
export function incidentScope(value: string): IncidentScope {
  if (value !== "own" && value !== "laboratory")
    throw new IncidentError("input");
  return value;
}
export function incidentVersion(value: number) {
  if (!Number.isSafeInteger(value) || value < 1)
    throw new IncidentError("input");
  return value;
}
export function requireIncidentTransition(
  before: IncidentStatus,
  next: string,
): IncidentStatus {
  if (
    (before === "open" && next === "in_review") ||
    (before === "in_review" && next === "resolved")
  )
    return next;
  throw new IncidentError("state");
}
export type IncidentTargetSnapshot = {
  name: string;
  spaceName: string;
  locationId: string | null;
  locationName: string | null;
};
export type Incident = {
  id: string;
  laboratoryId: string;
  targetKind: IncidentTargetKind;
  spaceId: string;
  resourceId: string | null;
  sessionId: string | null;
  usageId: string | null;
  reportedBy: string;
  description: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  targetSnapshot: IncidentTargetSnapshot;
  resolution: string | null;
  resolvedAt: Date | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
};
export type IncidentListEntry = Incident & { reporterName: string };
export type IncidentEvent = {
  id: string;
  actorUserId: string;
  actorName: string;
  source: IncidentSource;
  action: string;
  note: string;
  createdAt: Date;
};
export type IncidentUsage = {
  id: string;
  userName: string;
  resourceId: string;
  startedAt: Date;
  endedAt: Date | null;
  sessionId: string | null;
  reservationId: string | null;
};
export type IncidentOptions = {
  targets: { kind: IncidentTargetKind; id: string; name: string }[];
  usages: (IncidentUsage & { resourceName: string })[];
};
export type IncidentReport = {
  targetKind: IncidentTargetKind;
  targetId: string;
  usageId: string | null;
  description: string;
  severity: IncidentSeverity;
  source: IncidentSource;
};
