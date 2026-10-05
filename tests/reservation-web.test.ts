import assert from "node:assert/strict";
import test from "node:test";
import {
  localToInstant,
  formatReservationTime,
} from "../src/modules/reservations/web/time";
import { reservationActionError } from "../src/modules/reservations/web/reservation-web";
import { reservationFormFingerprint } from "../src/modules/reservations/web/form-state";
import {
  ReservationInputError,
  ReservationConflictError,
  ReservationNotFoundError,
} from "../src/modules/reservations/domain/reservation";
import { AuthorizationDeniedError } from "../src/modules/identity/domain/access-errors";

test("Mexico City conversion ignores process timezone and sends explicit UTC", () => {
  const previous = process.env.TZ;
  try {
    for (const zone of ["UTC", "Asia/Tokyo", "America/Los_Angeles"]) {
      process.env.TZ = zone;
      assert.equal(
        localToInstant("2026-10-06T10:15"),
        "2026-10-06T16:15:00.000Z",
      );
      assert.equal(
        localToInstant("2026-07-01T10:15"),
        "2026-07-01T16:15:00.000Z",
      );
      assert.equal(
        localToInstant("2022-07-01T10:15"),
        "2022-07-01T15:15:00.000Z",
      );
      assert.match(formatReservationTime("2026-10-06T16:15:00.000Z"), /10:15/);
    }
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});
test("rejects invalid dates, historical gaps and ambiguous local times", () => {
  for (const value of [
    "",
    "2026-02-30T10:00",
    "2026-13-01T10:00",
    "2026-10-06T24:00",
    "2026-10-06T10:00Z",
    "2022-04-03T02:30",
    "2022-10-30T01:30",
  ])
    assert.throws(() => localToInstant(value), ReservationInputError);
  assert.equal(localToInstant("2028-02-29T23:30"), "2028-03-01T05:30:00.000Z");
});
test("public errors hide internals and preserve uniform not-found semantics", () => {
  assert.match(
    reservationActionError(new ReservationConflictError("SQLSTATE 23P01"))
      .message,
    /ya no está disponible/,
  );
  assert.deepEqual(
    reservationActionError(new ReservationNotFoundError()),
    reservationActionError(new AuthorizationDeniedError()),
  );
  const unexpected = new Error("unexpected infrastructure error");
  assert.throws(() => reservationActionError(unexpected), unexpected);
});
test("availability feedback is tied to all submitted selection fields", () => {
  const form = new FormData();
  form.set("spaceId", "space");
  form.set("mode", "resources");
  form.append("resourceIds", "a");
  form.append("resourceIds", "b");
  form.set("startsLocal", "2026-10-06T10:00");
  form.set("endsLocal", "2026-10-06T11:00");
  const initial = reservationFormFingerprint(form);
  form.set("intent", "create");
  assert.equal(reservationFormFingerprint(form), initial);
  form.set("endsLocal", "2026-10-06T12:00");
  assert.notEqual(reservationFormFingerprint(form), initial);
  form.set("endsLocal", "2026-10-06T11:00");
  form.delete("resourceIds");
  form.append("resourceIds", "a");
  assert.notEqual(reservationFormFingerprint(form), initial);
});
