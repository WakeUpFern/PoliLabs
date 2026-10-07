import { test } from "node:test";
import assert from "node:assert/strict";
import {
  IncidentError,
  incidentText,
  incidentTargetKind,
  incidentSeverity,
  incidentSource,
  incidentId,
  incidentVersion,
  incidentScope,
  requireIncidentTransition,
} from "../src/modules/incidents/domain/incidents";
import { IncidentService } from "../src/modules/incidents/application/incidents";
import type { IncidentStore } from "../src/modules/incidents/application/incident-store";
const id = "11111111-1111-1111-1111-111111111111";
test("incident inputs bound descriptions, severity, target, source and version", () => {
  assert.equal(incidentText("  fuga  "), "fuga");
  for (const s of ["", " ", "x".repeat(5001)])
    assert.throws(() => incidentText(s), IncidentError);
  for (const kind of ["resource", "space", "session"])
    assert.equal(incidentTargetKind(kind), kind);
  for (const severity of ["low", "medium", "high"])
    assert.equal(incidentSeverity(severity), severity);
  for (const source of ["WEB", "API", "AGENT", "SYSTEM"])
    assert.equal(incidentSource(source), source);
  for (const fn of [
    () => incidentTargetKind("practice"),
    () => incidentSeverity("critical"),
    () => incidentSource("CLIENT"),
    () => incidentScope("all"),
    () => incidentId("unknown"),
    () => incidentVersion(0),
    () => incidentVersion(1.1),
  ])
    assert.throws(fn, IncidentError);
});
test("incident lifecycle requires review and rejects reopening, skipping and repeats", () => {
  assert.equal(requireIncidentTransition("open", "in_review"), "in_review");
  assert.equal(requireIncidentTransition("in_review", "resolved"), "resolved");
  for (const [from, next] of [
    ["open", "resolved"],
    ["open", "open"],
    ["in_review", "open"],
    ["resolved", "open"],
    ["resolved", "resolved"],
  ] as const)
    assert.throws(() => requireIncidentTransition(from, next), IncidentError);
});
test("application rejects invalid relations and resolution notes before persistence", () => {
  const store: IncidentStore = {
    run() {
      throw new Error("Must not reach persistence");
    },
  };
  const service = new IncidentService(store);
  const actor = { actorUserId: id, laboratoryId: id, source: "WEB" };
  assert.throws(
    () =>
      service.report({
        ...actor,
        targetKind: "space",
        targetId: id,
        usageId: id,
        description: "fuga",
        severity: "medium",
      }),
    IncidentError,
  );
  assert.throws(
    () =>
      service.transition({
        ...actor,
        incidentId: id,
        next: "resolved",
        expectedVersion: 1,
        note: " ",
      }),
    IncidentError,
  );
  assert.throws(() => service.list({ ...actor, scope: "all" }), IncidentError);
});
