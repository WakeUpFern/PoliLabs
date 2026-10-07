import "server-only";
import { requireCurrentActor } from "@/app/_lib/current-actor";
import { getLaboratoryBySlug } from "@/modules/identity/infrastructure/services";
import { maintenanceService } from "../infrastructure/services";
import { MaintenanceWeb } from "./maintenance-web";
export const maintenanceWeb = new MaintenanceWeb({
  currentActor: requireCurrentActor,
  laboratory: getLaboratoryBySlug,
  maintenance: maintenanceService,
});
