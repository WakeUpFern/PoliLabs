import "server-only";
import { getDatabase } from "@/infrastructure/database/client";
import {
  CancelReservation,
  CheckAvailability,
  CreateReservation,
  GetReservation,
  ListMyReservations,
} from "../application/reservations";
import { DrizzleReservationStore } from "./reservation-store";
const store = new DrizzleReservationStore(getDatabase());
export const checkAvailability = new CheckAvailability(store);
export const createReservation = new CreateReservation(store);
export const getReservation = new GetReservation(store);
export const listMyReservations = new ListMyReservations(store);
export const cancelReservation = new CancelReservation(store);
