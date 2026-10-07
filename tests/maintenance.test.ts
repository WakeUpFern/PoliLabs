import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MaintenanceError,
  maintenanceMaterials,
  maintenanceSource,
  maintenanceText,
  maintenanceType,
  nextDueOn,
  operationalStatus,
  performedAt,
  isAvailableStatus,
} from "../src/modules/maintenance/domain/maintenance";
import { MaintenanceService } from "../src/modules/maintenance/application/maintenance";
import type { MaintenanceStore } from "../src/modules/maintenance/application/maintenance-store";
const id = "11111111-1111-1111-1111-111111111111";
const other = "22222222-2222-2222-2222-222222222222";
const now = new Date("2026-10-07T18:00:00Z");
test("maintenance inputs bound type, status, source and description", () => {
  for (const type of ["preventive", "corrective", "inspection", "other"])
    assert.equal(maintenanceType(type), type);
  for (const status of ["operational", "in_maintenance", "out_of_service"])
    assert.equal(operationalStatus(status), status);
  assert.equal(maintenanceText("  lubricación "), "lubricación");
  for (const fn of [
    () => maintenanceType("cleaning"),
    () => operationalStatus("broken"),
    () => maintenanceSource("CLIENT"),
    () => maintenanceText(" "),
    () => maintenanceText("x".repeat(5001)),
  ])
    assert.throws(fn, MaintenanceError);
});
test("only operational resources are available (RB5)", () => {
  assert.equal(isAvailableStatus("operational"), true);
  assert.equal(isAvailableStatus("in_maintenance"), false);
  assert.equal(isAvailableStatus("out_of_service"), false);
});
test("performed time requires an offset and cannot be in the future", () => {
  assert.equal(
    performedAt("2026-10-07T11:30:00-06:00", now).toISOString(),
    "2026-10-07T17:30:00.000Z",
  );
  for (const value of [
    "2026-10-07T11:30:00",
    "2026-10-07T19:00:00Z",
    "not a date",
  ])
    assert.throws(() => performedAt(value, now), MaintenanceError);
});
test("next due date is a real calendar date not before the work", () => {
  const performed = new Date("2026-10-07T17:30:00Z");
  assert.equal(nextDueOn("", performed), null);
  assert.equal(nextDueOn(null, performed), null);
  assert.equal(nextDueOn("2026-10-07", performed), "2026-10-07");
  assert.equal(nextDueOn("2027-04-07", performed), "2027-04-07");
  for (const value of ["2026-10-06", "2026-02-30", "07/10/2026"])
    assert.throws(() => nextDueOn(value, performed), MaintenanceError);
});
test("materials are distinct, bounded and sorted for stable locking", () => {
  assert.deepEqual(
    maintenanceMaterials([
      { itemId: other, quantity: " 1.5 " },
      { itemId: id.toUpperCase(), quantity: "2" },
    ]),
    [
      { itemId: id, quantity: "2" },
      { itemId: other, quantity: "1.5" },
    ],
  );
  assert.throws(
    () =>
      maintenanceMaterials([
        { itemId: id, quantity: "1" },
        { itemId: id, quantity: "2" },
      ]),
    MaintenanceError,
  );
  assert.throws(
    () =>
      maintenanceMaterials(
        Array.from({ length: 21 }, (_, i) => ({
          itemId: `00000000-0000-0000-0000-${String(i).padStart(12, "0")}`,
          quantity: "1",
        })),
      ),
    MaintenanceError,
  );
});
test("application rejects invalid records before persistence", () => {
  const store: MaintenanceStore = {
    run() {
      throw new Error("Must not reach persistence");
    },
  };
  const service = new MaintenanceService(store, () => now);
  const valid = {
    actorUserId: id,
    laboratoryId: id,
    resourceId: id,
    type: "preventive",
    description: "Lubricación",
    statusAfter: "operational",
    performedAt: "2026-10-07T10:00:00-06:00",
    source: "WEB",
  };
  for (const overrides of [
    { resourceId: "unknown" },
    { type: "cleaning" },
    { statusAfter: "broken" },
    { performedAt: "2026-10-08T10:00:00-06:00" },
    { nextDueOn: "2026-10-01" },
    { incidentId: "unknown" },
    { materials: [{ itemId: id, quantity: "0" }] },
    { materials: [{ itemId: id, quantity: "-1" }] },
    { materials: [{ itemId: id, quantity: "1.2345" }] },
    { materials: [{ itemId: id, quantity: "1e3" }] },
    { source: "CLIENT" },
  ])
    assert.throws(
      () => service.record({ ...valid, ...overrides }),
      MaintenanceError,
    );
});
