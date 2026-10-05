import assert from "node:assert/strict";
import test from "node:test";
import {
  conflicts,
  normalizeInterval,
  normalizeTarget,
  overlaps,
  requireCancellable,
  requireFutureStart,
  ReservationInputError,
  ReservationCancellationError,
  type Reservation,
} from "../src/modules/reservations/domain/reservation";
const spaceId = "10000000-0000-4000-8000-000000000001";
const resourceId = "20000000-0000-4000-8000-000000000001";
const interval = (start: number, end: number) => ({
  startsAt: new Date(start * 1000),
  endsAt: new Date(end * 1000),
});

test("half-open overlap covers exact, partial and containing intervals", () => {
  const baseline = interval(10, 20);
  for (const other of [
    interval(10, 20),
    interval(5, 15),
    interval(15, 25),
    interval(12, 18),
    interval(5, 25),
  ]) {
    assert.equal(overlaps(baseline, other), true);
    assert.equal(overlaps(other, baseline), true);
  }
  assert.equal(overlaps(baseline, interval(20, 30)), false);
  assert.equal(overlaps(interval(0, 10), baseline), false);
});

test("requires explicit offset and valid nonempty calendar interval", () => {
  const valid = normalizeInterval({
    startsAt: "2030-01-01T10:00:00-06:00",
    endsAt: "2030-01-01T17:00:00Z",
  });
  assert.equal(valid.startsAt.toISOString(), "2030-01-01T16:00:00.000Z");
  for (const value of [
    "2030-02-30T10:00:00Z",
    "2030-01-01T24:00:00Z",
    "2030-01-01T10:00:00",
    "garbage",
  ]) {
    assert.throws(
      () =>
        normalizeInterval({ startsAt: value, endsAt: "2031-01-01T10:00:00Z" }),
      ReservationInputError,
    );
  }
  for (const endsAt of ["2030-01-01T10:00:00Z", "2029-01-01T10:00:00Z"])
    assert.throws(
      () => normalizeInterval({ startsAt: "2030-01-01T10:00:00Z", endsAt }),
      ReservationInputError,
    );
});

test("requires future start, including rejecting intervals already in progress", () => {
  for (const target of [interval(0, 5), interval(0, 20), interval(10, 20)])
    assert.throws(
      () => requireFutureStart(target, new Date(10000)),
      ReservationInputError,
    );
  requireFutureStart(interval(11, 20), new Date(10000));
});

test("target is exclusive space or one or more distinct resources", () => {
  assert.deepEqual(
    normalizeTarget({ spaceId, isExclusive: true, resourceIds: [] })
      .resourceIds,
    [],
  );
  assert.deepEqual(
    normalizeTarget({ spaceId, isExclusive: false, resourceIds: [resourceId] })
      .resourceIds,
    [resourceId],
  );
  for (const target of [
    { spaceId, isExclusive: false, resourceIds: [] },
    { spaceId, isExclusive: true, resourceIds: [resourceId] },
    {
      spaceId,
      isExclusive: false,
      resourceIds: [resourceId, resourceId.toUpperCase()],
    },
    { spaceId: "bad", isExclusive: true, resourceIds: [] },
  ])
    assert.throws(() => normalizeTarget(target), ReservationInputError);
});

test("exclusive conflict is symmetric; distinct resources and spaces coexist", () => {
  const a = {
    spaceId,
    resourceIds: [resourceId],
    isExclusive: false,
    ...interval(10, 20),
  };
  const b = { ...a, isExclusive: true, resourceIds: [] };
  assert.equal(conflicts(a, b), true);
  assert.equal(conflicts(b, a), true);
  assert.equal(conflicts(a, { ...a, resourceIds: [spaceId] }), false);
  assert.equal(conflicts(b, { ...b, spaceId: resourceId }), false);
});

test("cancellation preserves started confirmed records and remains idempotent", () => {
  const reservation: Reservation = {
    id: resourceId,
    createdBy: resourceId,
    spaceId,
    resourceIds: [],
    isExclusive: true,
    ...interval(10, 20),
    status: "confirmed",
    createdAt: new Date(0),
    cancelledAt: null,
  };
  requireCancellable(reservation, new Date(9000));
  assert.throws(
    () => requireCancellable(reservation, new Date(10000)),
    ReservationCancellationError,
  );
  assert.throws(
    () => requireCancellable(reservation, new Date(30000)),
    ReservationCancellationError,
  );
  requireCancellable(
    { ...reservation, status: "cancelled", cancelledAt: new Date(9000) },
    new Date(30000),
  );
});
