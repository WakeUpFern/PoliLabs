import "server-only";
import { requireCurrentActor } from "@/app/_lib/current-actor";
import { getLaboratoryBySlug } from "@/modules/identity/infrastructure/services";
import { reportService } from "../infrastructure/services";
import { renderReportPdf } from "../infrastructure/pdf-renderer";
import { ReportsWeb } from "./reports-web";
export const reportsWeb = new ReportsWeb({
  currentActor: requireCurrentActor,
  laboratory: getLaboratoryBySlug,
  reports: reportService,
  renderPdf: renderReportPdf,
});
