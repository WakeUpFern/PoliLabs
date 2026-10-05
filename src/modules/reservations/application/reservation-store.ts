import type { PermissionKey } from "@/modules/identity/domain/access-catalog";
import type {
  Reservation,
  ReservationInterval,
  ReservationTarget,
} from "../domain/reservation";

export type ActorContext = { actorUserId: string; laboratoryId: string };
export type ReservationRequest = ActorContext &
  ReservationTarget &
  ReservationInterval;
export interface ReservationSession {
  checkAvailability(input: ReservationRequest): Promise<{ available: boolean }>;
  create(input: ReservationRequest): Promise<Reservation>;
  get(input: ActorContext & { reservationId: string }): Promise<Reservation>;
  listMine(input: ActorContext): Promise<readonly Reservation[]>;
  cancel(input: ActorContext & { reservationId: string }): Promise<Reservation>;
}
export interface ReservationStore {
  run<T>(
    context: ActorContext,
    permission: PermissionKey,
    operation: (session: ReservationSession) => Promise<T>,
  ): Promise<T>;
}
