import assert from "node:assert/strict";
import test from "node:test";
import {
  addLocalMinutes,
  formatDuration,
  layoutDay,
  minuteToTime,
} from "../src/modules/reservations/web/grid";

// A Mexico City day: 2026-03-10 00:00 local is 06:00Z.
const dayStart = "2026-03-10T06:00:00.000Z";
const dayEnd = "2026-03-11T06:00:00.000Z";
const at = (hour: number, minute = 0) =>
  new Date(Date.parse(dayStart) + (hour * 60 + minute) * 60_000).toISOString();
const entry = (id: string, from: string, to: string) => ({
  id,
  startsAt: from,
  endsAt: to,
});

test("layoutDay places blocks by minute and clips them to the day", () => {
  const blocks = layoutDay(
    [
      entry("a", at(8), at(10)),
      entry("b", at(-2), at(1)),
      entry("c", at(23), at(26)),
      entry("outside", at(30), at(31)),
    ],
    dayStart,
    dayEnd,
  );
  const byId = Object.fromEntries(blocks.map((b) => [b.entry.id, b]));
  assert.deepEqual(Object.keys(byId).sort(), ["a", "b", "c"]);
  assert.equal(byId.a.startMinute, 480);
  assert.equal(byId.a.endMinute, 600);
  assert.equal(byId.b.startMinute, 0);
  assert.equal(byId.b.endMinute, 60);
  assert.equal(byId.c.endMinute, 1440);
});

test("layoutDay splits overlapping blocks into lanes per cluster", () => {
  const blocks = layoutDay(
    [
      entry("a", at(8), at(10)),
      entry("b", at(9), at(11)),
      entry("c", at(10), at(12)),
      entry("d", at(14), at(15)),
    ],
    dayStart,
    dayEnd,
  );
  const byId = Object.fromEntries(blocks.map((b) => [b.entry.id, b]));
  assert.equal(byId.a.lane, 0);
  assert.equal(byId.b.lane, 1);
  // c starts when a ends, so it reuses the first lane.
  assert.equal(byId.c.lane, 0);
  assert.equal(byId.a.lanes, 2);
  assert.equal(byId.c.lanes, 2);
  assert.equal(byId.d.lane, 0);
  assert.equal(byId.d.lanes, 1);
});

test("wall-clock helpers format and add minutes across midnight", () => {
  assert.equal(minuteToTime(0), "00:00");
  assert.equal(minuteToTime(570), "09:30");
  assert.equal(minuteToTime(1440), "00:00");
  assert.equal(addLocalMinutes("2026-03-10", "09:30", 90), "2026-03-10T11:00");
  assert.equal(addLocalMinutes("2026-12-31", "23:30", 60), "2027-01-01T00:30");
  assert.equal(formatDuration(30), "30 min");
  assert.equal(formatDuration(120), "2 h");
  assert.equal(formatDuration(90), "1 h 30 min");
});
