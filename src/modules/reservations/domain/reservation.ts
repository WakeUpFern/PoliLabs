import { isSpatialId } from "@/modules/spatial/domain/spatial-id";

export class ReservationInputError extends Error {}
export class ReservationTargetError extends Error {}
export class ReservationConflictError extends Error {}
export class ReservationNotFoundError extends Error {}
export class ReservationCancellationError extends Error {}

export type ReservationTarget = {
  spaceId: string;
  isExclusive: boolean;
  resourceIds: readonly string[];
};
export type ReservationInterval = { startsAt: Date; endsAt: Date };
export type Reservation = ReservationTarget &
  ReservationInterval & {
    id: string;
    createdBy: string;
    status: "confirmed" | "cancelled";
    createdAt: Date;
    cancelledAt: Date | null;
  };
export type IntervalInput = { startsAt: string; endsAt: string };

function instant(value: string) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(
      value,
    )
  )
    throw new ReservationInputError(
      "An explicit ISO timestamp offset is required.",
    );
  const date = new Date(value);
  // Date.parse normalizes impossible calendar dates, so validate the calendar separately.
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (
    !Number.isFinite(date.getTime()) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > days ||
    Number(value.slice(11, 13)) > 23
  )
    throw new ReservationInputError("Invalid instant.");
  return date;
}

export function normalizeInterval(input: IntervalInput): ReservationInterval {
  const startsAt = instant(input.startsAt);
  const endsAt = instant(input.endsAt);
  if (startsAt >= endsAt)
    throw new ReservationInputError("Start must precede end.");
  return { startsAt, endsAt };
}

export function requireFutureStart(interval: ReservationInterval, now: Date) {
  if (interval.startsAt <= now)
    throw new ReservationInputError("Start must be in the future.");
}

export function normalizeTarget(input: ReservationTarget): ReservationTarget {
  if (
    !isSpatialId(input.spaceId) ||
    typeof input.isExclusive !== "boolean" ||
    !Array.isArray(input.resourceIds) ||
    input.resourceIds.some((id) => !isSpatialId(id))
  )
    throw new ReservationInputError("Invalid reservation target.");
  const resourceIds = input.resourceIds.map((id) => id.toLowerCase()).sort();
  if (
    new Set(resourceIds).size !== resourceIds.length ||
    (input.isExclusive ? resourceIds.length !== 0 : resourceIds.length === 0)
  )
    throw new ReservationInputError(
      "Choose an exclusive space or distinct resources.",
    );
  return {
    spaceId: input.spaceId.toLowerCase(),
    isExclusive: input.isExclusive,
    resourceIds,
  };
}

export function overlaps(a: ReservationInterval, b: ReservationInterval) {
  return a.startsAt < b.endsAt && b.startsAt < a.endsAt;
}

export function conflicts(
  a: ReservationTarget & ReservationInterval,
  b: ReservationTarget & ReservationInterval,
) {
  return (
    a.spaceId === b.spaceId &&
    overlaps(a, b) &&
    (a.isExclusive ||
      b.isExclusive ||
      a.resourceIds.some((id) => b.resourceIds.includes(id)))
  );
}

export function requireCancellable(reservation: Reservation, now: Date) {
  if (reservation.status !== "cancelled" && reservation.startsAt <= now)
    throw new ReservationCancellationError(
      "A started reservation cannot be cancelled.",
    );
}
