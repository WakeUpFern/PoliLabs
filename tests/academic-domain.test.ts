import assert from "node:assert/strict";
import test from "node:test";
import {
  AcademicError,
  academicId,
  academicSource,
  practiceValues,
  practiceTransition,
  sessionTransition,
  sessionValues,
  requireSessionEditable,
  participantIds,
} from "../src/modules/academic/domain/academic";
import {
  localToInstant,
  instantToLocal,
} from "../src/modules/academic/web/time";
import { academicActionError } from "../src/modules/academic/web/academic-web";
const id = "00000000-0000-0000-0000-000000000001";
const interval = {
  spaceId: id,
  teacherUserId: id,
  startsAt: "2026-10-05T14:00:00-06:00",
  endsAt: "2026-10-05T16:00:00-06:00",
};
test("practice input is bounded, trimmed and cannot be empty", () => {
  assert.deepEqual(
    practiceValues({ title: "  Torno  ", instructions: "  Lee el manual  " }),
    { title: "Torno", instructions: "Lee el manual" },
  );
  for (const input of [
    { title: " ", instructions: "x" },
    { title: "x", instructions: " " },
    { title: "x".repeat(201), instructions: "x" },
    { title: "x", instructions: "x".repeat(20001) },
  ])
    assert.throws(() => practiceValues(input), AcademicError);
});
test("practice and session lifecycles reject reopening and skipped steps", () => {
  assert.equal(practiceTransition("draft", "published"), "published");
  assert.equal(practiceTransition("published", "closed"), "closed");
  assert.throws(() => practiceTransition("draft", "closed"), AcademicError);
  assert.throws(() => practiceTransition("closed", "published"), AcademicError);
  assert.equal(sessionTransition("scheduled", "open"), "open");
  assert.equal(sessionTransition("open", "closed"), "closed");
  assert.equal(sessionTransition("scheduled", "cancelled"), "cancelled");
  for (const status of ["closed", "cancelled"] as const)
    assert.throws(() => sessionTransition(status, "open"), AcademicError);
  assert.throws(() => sessionTransition("scheduled", "closed"), AcademicError);
  assert.throws(() => requireSessionEditable("open"), AcademicError);
});
test("session instants require valid calendar dates, offset and positive interval", () => {
  assert.equal(
    sessionValues(interval).startsAt.toISOString(),
    "2026-10-05T20:00:00.000Z",
  );
  for (const startsAt of [
    "2026-10-05T14:00:00",
    "2026-02-30T14:00:00Z",
    "2026-13-05T14:00:00Z",
    "2026-10-05T24:00:00Z",
    "2026-10-05T14:60:00Z",
  ])
    assert.throws(
      () => sessionValues({ ...interval, startsAt }),
      AcademicError,
    );
  assert.throws(
    () => sessionValues({ ...interval, endsAt: interval.startsAt }),
    AcademicError,
  );
  assert.throws(
    () => sessionValues({ ...interval, spaceId: "bad" }),
    AcademicError,
  );
});
test("participants are concrete unique identifiers, origins are allowlisted", () => {
  assert.deepEqual(participantIds([id]), [id]);
  assert.throws(() => participantIds([id, id]), AcademicError);
  assert.throws(() => participantIds(["someone"]), AcademicError);
  assert.throws(() => academicId(""), AcademicError);
  assert.equal(academicSource("AGENT"), "AGENT");
  assert.throws(() => academicSource("sql"), AcademicError);
});
test("academic web times round-trip independently of browser timezone", () => {
  assert.equal(localToInstant("2026-10-05T14:00"), "2026-10-05T20:00:00.000Z");
  assert.equal(
    instantToLocal(localToInstant("2026-10-05T14:00")),
    "2026-10-05T14:00",
  );
  assert.throws(() => localToInstant("2026-02-30T14:00"), AcademicError);
  assert.throws(() => localToInstant("2022-04-03T02:30"), AcademicError);
  assert.throws(() => localToInstant("2022-10-30T01:30"), AcademicError);
  assert.match(
    academicActionError(new AcademicError("own-participation")).message,
    /propia participación/,
  );
  assert.throws(
    () => academicActionError(new Error("unexpected")),
    /unexpected/,
  );
});
