import "server-only";
import { getDatabase } from "@/infrastructure/database/client";
import { UsageService } from "../application/usage";
import { DrizzleUsageStore } from "./usage-store";
export const usageService = new UsageService(
  new DrizzleUsageStore(getDatabase()),
);
