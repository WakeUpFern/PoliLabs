import type { ReservationTarget, IntervalInput } from "../domain/reservation";
import {
  normalizeInterval,
  normalizeTarget,
  ReservationNotFoundError,
} from "../domain/reservation";
import { isSpatialId } from "@/modules/spatial/domain/spatial-id";
import type { ActorContext, ReservationStore } from "./reservation-store";

type Request = ActorContext & ReservationTarget & IntervalInput;
export class CheckAvailability {
  constructor(private readonly store: ReservationStore) {}
  execute(input: Request) {
    const values = {
      ...input,
      ...normalizeTarget(input),
      ...normalizeInterval(input),
    };
    return this.store.run(input, "reservation.read", (session) =>
      session.checkAvailability(values),
    );
  }
}
export class CreateReservation {
  constructor(private readonly store: ReservationStore) {}
  execute(input: Request) {
    const values = {
      ...input,
      ...normalizeTarget(input),
      ...normalizeInterval(input),
    };
    return this.store.run(input, "reservation.create", (session) =>
      session.create(values),
    );
  }
}
export class GetReservation {
  constructor(private readonly store: ReservationStore) {}
  execute(input: ActorContext & { reservationId: string }) {
    if (!isSpatialId(input.reservationId)) throw new ReservationNotFoundError();
    return this.store.run(input, "reservation.read", (session) =>
      session.get(input),
    );
  }
}
export class ListMyReservations {
  constructor(private readonly store: ReservationStore) {}
  execute(input: ActorContext) {
    return this.store.run(input, "reservation.read", (session) =>
      session.listMine(input),
    );
  }
}
export class CancelReservation {
  constructor(private readonly store: ReservationStore) {}
  execute(input: ActorContext & { reservationId: string }) {
    if (!isSpatialId(input.reservationId)) throw new ReservationNotFoundError();
    return this.store.run(input, "reservation.cancel", (session) =>
      session.cancel(input),
    );
  }
}
