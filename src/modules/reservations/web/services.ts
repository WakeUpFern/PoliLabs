import "server-only";
import { requireCurrentActor } from "@/app/_lib/current-actor";
import { getDatabase } from "@/infrastructure/database/client";
import { AuthorizationService } from "@/modules/identity/application/authorization-service";
import { DrizzleAuthorizationReader } from "@/modules/identity/infrastructure/access-repository";
import { getLaboratoryBySlug } from "@/modules/identity/infrastructure/services";
import {
  listSpaces,
  listResources,
  listLocations,
} from "@/modules/spatial/infrastructure/services";
import {
  checkAvailability,
  createReservation,
  listMyReservations,
  getReservation,
  cancelReservation,
} from "../infrastructure/services";
import { ReservationWeb } from "./reservation-web";
export const reservationWeb = new ReservationWeb({
  currentActor: requireCurrentActor,
  laboratory: getLaboratoryBySlug,
  authorization: new AuthorizationService(
    new DrizzleAuthorizationReader(getDatabase()),
  ),
  spaces: listSpaces,
  resources: listResources,
  locations: listLocations,
  availability: checkAvailability,
  create: createReservation,
  list: listMyReservations,
  get: getReservation,
  cancel: cancelReservation,
});
