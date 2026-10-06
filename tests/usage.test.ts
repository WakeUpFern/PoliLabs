import test from "node:test";
import assert from "node:assert/strict";
import {
  UsageError,
  usageKind,
  requireUsageEligibility,
} from "../src/modules/usage/domain/usage";
test("Usage academic eligibility follows explicit opening rather than scheduled clock", () => {
  const now = new Date("2026-10-06T10:00:00Z"),
    input = {
      kind: usageKind("academic"),
      status: "open",
      isEligibleUser: true,
      startsAt: new Date("2026-10-07T10:00:00Z"),
      endsAt: new Date("2026-10-07T12:00:00Z"),
    };
  requireUsageEligibility(input, now);
  for (const status of ["scheduled", "closed", "cancelled"])
    assert.throws(
      () => requireUsageEligibility({ ...input, status }, now),
      UsageError,
    );
  assert.throws(
    () => requireUsageEligibility({ ...input, isEligibleUser: false }, now),
    UsageError,
  );
});
test("Usage reservation eligibility is half-open and requires confirmed ownership", () => {
  const input = {
    kind: usageKind("reservation"),
    status: "confirmed",
    isEligibleUser: true,
    startsAt: new Date("2026-10-06T10:00:00Z"),
    endsAt: new Date("2026-10-06T12:00:00Z"),
  };
  requireUsageEligibility(input, input.startsAt);
  assert.throws(() => requireUsageEligibility(input, input.endsAt), UsageError);
  assert.throws(
    () => requireUsageEligibility(input, new Date("2026-10-06T09:59:59Z")),
    UsageError,
  );
  assert.throws(
    () =>
      requireUsageEligibility(
        { ...input, status: "cancelled" },
        input.startsAt,
      ),
    UsageError,
  );
  assert.throws(() => usageKind("attendance"), UsageError);
});
