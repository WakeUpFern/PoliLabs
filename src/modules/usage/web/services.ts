import "server-only";
import { requireCurrentActor } from "@/app/_lib/current-actor";
import { getLaboratoryBySlug } from "@/modules/identity/infrastructure/services";
import { usageService } from "../infrastructure/services";
import { UsageWeb } from "./usage-web";
export const usageWeb = new UsageWeb({
  currentActor: requireCurrentActor,
  laboratory: getLaboratoryBySlug,
  usage: usageService,
});
