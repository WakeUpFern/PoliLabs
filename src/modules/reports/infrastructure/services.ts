import "server-only";
import { getDatabase } from "@/infrastructure/database/client";
import { ReportService } from "../application/reports";
import { DrizzleReportStore } from "./report-store";
export const reportService = new ReportService(
  new DrizzleReportStore(getDatabase()),
);
