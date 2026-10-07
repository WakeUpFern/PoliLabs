import "server-only";
import { requireCurrentActor } from "@/app/_lib/current-actor";
import { getLaboratoryBySlug } from "@/modules/identity/infrastructure/services";
import { incidentService } from "../infrastructure/services";
import { IncidentsWeb } from "./incidents-web";
export const incidentsWeb = new IncidentsWeb({
  currentActor: requireCurrentActor,
  laboratory: getLaboratoryBySlug,
  incidents: incidentService,
});
