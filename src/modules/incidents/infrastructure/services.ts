import "server-only";
import { getDatabase } from "@/infrastructure/database/client";
import { IncidentService } from "../application/incidents";
import { DrizzleIncidentStore } from "./incident-store";
export const incidentService = new IncidentService(
  new DrizzleIncidentStore(getDatabase()),
);
