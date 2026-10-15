import assert from "node:assert/strict";
import test from "node:test";
import {
  fitsFloorPlan,
  FloorPlanError,
  normalizeFloorPlanBox,
  normalizeFloorPlanElementTarget,
  normalizeFloorPlanInput,
} from "../src/modules/spatial/domain/floor-plan";
import {
  normalizeOccupancyWindow,
  occupancyEntry,
  ReservationInputError,
  resourceOccupancy,
  type Reservation,
} from "../src/modules/reservations/domain/reservation";
import {
  calendarDays,
  calendarWindow,
  entriesForDay,
  localDateTime,
  nextHourInterval,
  parseCalendarQuery,
  shiftCalendarDate,
} from "../src/modules/reservations/web/calendar";

const id = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;
const input = (error: unknown) =>
  error instanceof FloorPlanError && error.code === "input";

test("floor plan input is trimmed, integral and bounded", () => {
  assert.deepEqual(
    normalizeFloorPlanInput({ name: " Taller ", width: "20", height: 12 }),
    { name: "Taller", width: 20, height: 12 },
  );
  for (const bad of [
    { name: " ", width: 1, height: 1 },
    { name: "A", width: 0, height: 1 },
    { name: "A", width: 1, height: 101 },
    { name: "A", width: "1.5", height: 1 },
    { name: "A", width: "-1", height: 1 },
    { name: "A".repeat(121), width: 1, height: 1 },
  ])
    assert.throws(() => normalizeFloorPlanInput(bad), input);
  assert.throws(
    () => normalizeFloorPlanBox({ x: -1, y: 0, width: 1, height: 1 }),
    input,
  );
  assert.throws(
    () => normalizeFloorPlanBox({ x: 0, y: 0, width: 0, height: 1 }),
    input,
  );
});

test("floor plan elements target one resource, location or label", () => {
  assert.deepEqual(
    normalizeFloorPlanElementTarget({
      kind: "resource",
      targetId: id(1).toUpperCase(),
    }),
    { kind: "resource", resourceId: id(1), locationId: null, label: null },
  );
  assert.deepEqual(
    normalizeFloorPlanElementTarget({ kind: "label", label: " Puerta " }),
    { kind: "label", resourceId: null, locationId: null, label: "Puerta" },
  );
  assert.throws(
    () => normalizeFloorPlanElementTarget({ kind: "location", targetId: "x" }),
    input,
  );
  assert.throws(
    () => normalizeFloorPlanElementTarget({ kind: "wall", targetId: id(1) }),
    input,
  );
  const plan = { width: 10, height: 5 };
  assert.equal(fitsFloorPlan({ x: 8, y: 3, width: 2, height: 2 }, plan), true);
  assert.equal(fitsFloorPlan({ x: 9, y: 3, width: 2, height: 2 }, plan), false);
  assert.equal(fitsFloorPlan({ x: 0, y: 4, width: 1, height: 2 }, plan), false);
});

test("occupancy windows are bounded and hide other users' reservations", () => {
  assert.throws(
    () =>
      normalizeOccupancyWindow({
        startsAt: "2026-10-01T00:00:00Z",
        endsAt: "2026-11-12T00:00:01Z",
      }),
    ReservationInputError,
  );
  const window = normalizeOccupancyWindow({
    startsAt: "2026-10-01T00:00:00Z",
    endsAt: "2026-11-12T00:00:00Z",
  });
  assert.equal(window.endsAt.toISOString(), "2026-11-12T00:00:00.000Z");
  const reservation: Reservation = {
    id: id(9),
    createdBy: id(8),
    spaceId: id(7),
    isExclusive: false,
    resourceIds: [id(1)],
    startsAt: new Date("2026-10-01T15:00:00Z"),
    endsAt: new Date("2026-10-01T17:00:00Z"),
    status: "confirmed",
    createdAt: new Date(),
    cancelledAt: null,
  };
  const other = occupancyEntry(reservation, id(6));
  assert.equal(other.reservationId, null);
  assert.equal(other.isMine, false);
  assert.equal("createdBy" in other, false);
  assert.equal(occupancyEntry(reservation, id(8)).reservationId, id(9));

  const at = (time: string) => ({
    startsAt: new Date(`2026-10-01T${time}:00Z`),
    endsAt: new Date(`2026-10-01T${time.slice(0, 2)}:59:00Z`),
  });
  const free = { id: id(2), operational: true };
  const booked = { id: id(1), operational: true };
  assert.equal(resourceOccupancy(booked, [other], at("16:00")), "occupied");
  assert.equal(resourceOccupancy(free, [other], at("16:00")), "free");
  // [start, end): the hour right after the reservation is free.
  assert.equal(resourceOccupancy(booked, [other], at("17:00")), "free");
  assert.equal(
    resourceOccupancy({ ...free, operational: false }, [], at("16:00")),
    "blocked",
  );
  const exclusive = { ...other, isExclusive: true, resourceIds: [] };
  assert.equal(resourceOccupancy(free, [exclusive], at("16:00")), "occupied");
});

test("calendar ranges use Monday weeks and whole-week months", () => {
  assert.deepEqual(calendarDays("day", "2026-10-15"), ["2026-10-15"]);
  const week = calendarDays("week", "2026-10-15");
  assert.deepEqual([week[0], week[6]], ["2026-10-12", "2026-10-18"]);
  const month = calendarDays("month", "2026-10-15");
  assert.deepEqual(
    [month[0], month.at(-1), month.length],
    ["2026-09-28", "2026-11-01", 35],
  );
  const february = calendarDays("month", "2027-02-10");
  assert.deepEqual(
    [february[0], february.at(-1)],
    ["2027-02-01", "2027-02-28"],
  );
  assert.equal(shiftCalendarDate("month", "2026-01-31", 1), "2026-02-01");
  assert.equal(shiftCalendarDate("week", "2026-12-29", 1), "2027-01-05");
  assert.equal(shiftCalendarDate("day", "2026-03-01", -1), "2026-02-28");
  assert.deepEqual(
    parseCalendarQuery(
      { view: "year", date: "2026-02-30" },
      new Date("2026-10-15T05:30:00Z"),
    ),
    { view: "week", date: "2026-10-14" },
  );
});

test("calendar boundaries are Mexico City midnights, independent of the process zone", () => {
  // America/Mexico_City has no DST since 2022 (UTC-6); 2022-04-03 still had it.
  assert.deepEqual(calendarWindow(["2026-10-15"]), {
    startsAt: "2026-10-15T06:00:00.000Z",
    endsAt: "2026-10-16T06:00:00.000Z",
  });
  assert.deepEqual(calendarWindow(["2022-04-03"]), {
    startsAt: "2022-04-03T06:00:00.000Z",
    endsAt: "2022-04-04T05:00:00.000Z",
  });
  const overnight = {
    startsAt: "2026-10-16T04:00:00.000Z",
    endsAt: "2026-10-16T08:00:00.000Z",
  };
  assert.equal(entriesForDay([overnight], "2026-10-15").length, 1);
  assert.equal(entriesForDay([overnight], "2026-10-16").length, 1);
  assert.equal(entriesForDay([overnight], "2026-10-17").length, 0);
  assert.equal(localDateTime("2026-10-15T05:59:00Z"), "2026-10-14T23:59");
  assert.deepEqual(nextHourInterval(new Date("2026-10-15T17:20:00Z")), {
    startsLocal: "2026-10-15T12:00",
    endsLocal: "2026-10-15T13:00",
  });
});
