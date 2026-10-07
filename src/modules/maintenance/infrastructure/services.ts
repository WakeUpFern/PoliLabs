import "server-only";
import { getDatabase } from "@/infrastructure/database/client";
import { MaintenanceService } from "../application/maintenance";
import { DrizzleMaintenanceStore } from "./maintenance-store";
export const maintenanceService = new MaintenanceService(
  new DrizzleMaintenanceStore(getDatabase()),
);
