import test from "node:test";
import assert from "node:assert/strict";
import {
  attendanceStatus,
  correctionReason,
  requireAttendanceState,
  protectAttendanceManagement,
  preselectedSession,
  AttendanceError,
} from "../src/modules/attendance/domain/attendance";
import { safeReturnPath } from "../src/modules/identity/domain/return-path";
test("Attendance state gates distinguish new records from historical corrections", () => {
  requireAttendanceState("open");
  requireAttendanceState("closed", true);
  for (const state of ["scheduled", "closed", "cancelled"])
    assert.throws(() => requireAttendanceState(state), AttendanceError);
  assert.throws(
    () => requireAttendanceState("cancelled", true),
    AttendanceError,
  );
  assert.throws(() => protectAttendanceManagement(true), AttendanceError);
});
test("Attendance has explicit states and reasons, with unambiguous preselection only", () => {
  assert.equal(attendanceStatus("late"), "late");
  assert.throws(() => attendanceStatus("excused"), AttendanceError);
  assert.equal(correctionReason(" revisión "), "revisión");
  assert.throws(() => correctionReason(" "), AttendanceError);
  const candidate = {
    id: "session",
    title: "Practice",
    spaceId: "space",
    startsAt: new Date(),
    endsAt: new Date(),
  };
  assert.equal(preselectedSession([]), null);
  assert.equal(preselectedSession([candidate]), "session");
  assert.equal(preselectedSession([candidate, candidate]), null);
});
test("Login return paths reject external destinations and separator tricks", () => {
  for (const path of [
    "https://evil.test",
    "//evil.test",
    "/app\\evil",
    "/app/%2f%2fevil",
    "/application",
    null,
  ])
    assert.equal(safeReturnPath(path), "/app");
  assert.equal(
    safeReturnPath("/app/labs/test/attendance?location=abc"),
    "/app/labs/test/attendance?location=abc",
  );
});
