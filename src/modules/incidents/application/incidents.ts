import {
  incidentId,
  incidentSource,
  incidentTargetKind,
  incidentSeverity,
  incidentText,
  incidentScope,
  incidentVersion,
  IncidentError,
  type IncidentContext,
} from "../domain/incidents";
import type { IncidentStore } from "./incident-store";
export class IncidentService {
  constructor(private readonly store: IncidentStore) {}
  access(context: IncidentContext) {
    return this.store.run(context, "laboratory.read", async (_tx, keys) => ({
      canCreate: keys.includes("incident.create"),
      canReadOwn: keys.includes("incident.read"),
      canReview: keys.includes("incident.review"),
      canResolve: keys.includes("incident.resolve"),
      canTrace:
        keys.includes("incident.review") && keys.includes("usage.trace"),
    }));
  }
  options(context: IncidentContext) {
    return this.store.run(context, "incident.create", (tx) => tx.options());
  }
  report(
    input: IncidentContext & {
      targetKind: string;
      targetId: string;
      usageId?: string | null;
      description: string;
      severity: string;
      source: string;
    },
  ) {
    const report = {
      targetKind: incidentTargetKind(input.targetKind),
      targetId: incidentId(input.targetId),
      usageId: input.usageId ? incidentId(input.usageId) : null,
      description: incidentText(input.description),
      severity: incidentSeverity(input.severity),
      source: incidentSource(input.source),
    };
    if (report.usageId && report.targetKind !== "resource")
      throw new IncidentError("relation");
    return this.store.run(input, "incident.create", (tx) => tx.report(report));
  }
  list(input: IncidentContext & { scope: string }) {
    const scope = incidentScope(input.scope);
    return this.store.run(
      input,
      scope === "own" ? "incident.read" : "incident.review",
      (tx) => tx.list(scope),
    );
  }
  detail(input: IncidentContext & { incidentId: string; scope: string }) {
    const id = incidentId(input.incidentId),
      scope = incidentScope(input.scope);
    return this.store.run(
      input,
      scope === "own" ? "incident.read" : "incident.review",
      (tx) => tx.detail(id, scope),
    );
  }
  transition(
    input: IncidentContext & {
      incidentId: string;
      next: string;
      expectedVersion: number;
      note: string;
      source: string;
    },
  ) {
    const id = incidentId(input.incidentId),
      command = {
        next: input.next,
        expectedVersion: incidentVersion(input.expectedVersion),
        note: incidentText(input.note),
        source: incidentSource(input.source),
      };
    return this.store.run(input, "incident.resolve", (tx) =>
      tx.transition(id, command),
    );
  }
  trace(input: IncidentContext & { incidentId: string }) {
    const id = incidentId(input.incidentId);
    return this.store.run(input, "incident.review", (tx) => tx.trace(id));
  }
}
