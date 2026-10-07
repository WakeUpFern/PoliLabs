import type { GetLaboratoryBySlug } from "@/modules/identity/application/get-laboratory-by-slug";
import { AcademicError } from "@/modules/academic/domain/academic";
import { localToInstant } from "@/modules/academic/web/time";
import type { ReportService } from "../application/reports";
import { toCsv } from "../domain/csv";
import {
  addDays,
  MAX_PERIOD_DAYS,
  MAX_REPORT_ROWS,
  reportDate,
  ReportError,
  reportFileName,
  reportFormat,
  type ReportKey,
  type ReportTable,
} from "../domain/reports";

export const REPORT_ERROR_MESSAGES = {
  input: `Revisa el formato y el periodo: fecha inicial no posterior a la final y como máximo ${MAX_PERIOD_DAYS} días.`,
  "not-found": "El reporte no existe.",
  "too-large": `El reporte supera ${MAX_REPORT_ROWS} registros. Acota el periodo y vuelve a intentarlo.`,
} as const;

// Inclusive local dates of the laboratory become a half-open instant range.
function localDay(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new ReportError("input");
  try {
    return localToInstant(`${value}T00:00`);
  } catch (error) {
    if (error instanceof AcademicError) throw new ReportError("input");
    throw error;
  }
}
function localRange(from: string | null, to: string | null) {
  if (!from && !to) return { from: null, to: null };
  // Reject nonexistent dates such as 2026-02-30 before shifting the end.
  localDay(to);
  return { from: localDay(from), to: localDay(addDays(to as string, 1)) };
}

export class ReportsWeb {
  constructor(
    private readonly services: {
      currentActor: () => Promise<{ actorUserId: string }>;
      laboratory: Pick<GetLaboratoryBySlug, "execute">;
      reports: ReportService;
      renderPdf: (table: ReportTable) => Promise<Uint8Array>;
      clock?: () => Date;
    },
  ) {}
  private async context(slug: string) {
    const { actorUserId } = await this.services.currentActor();
    const lab = await this.services.laboratory.execute({
      actorUserId,
      laboratorySlug: slug,
    });
    return { actorUserId, laboratoryId: lab.id };
  }
  // Allowed reports, optionally narrowed to the ones a section offers.
  async page(slug: string, only?: readonly ReportKey[]) {
    const reports = (
      await this.services.reports.catalog(await this.context(slug))
    ).filter((report) => !only || only.includes(report.key));
    const today = reportDate(this.services.clock?.() ?? new Date());
    return { reports, defaults: { from: addDays(today, -29), to: today } };
  }
  async catalog(slug: string) {
    return this.services.reports.catalog(await this.context(slug));
  }
  async download(slug: string, report: string, query: URLSearchParams) {
    const format = reportFormat(query.get("format"));
    const context = await this.context(slug);
    const table = await this.services.reports.generate({
      ...context,
      report,
      // Only period reports read the range; the service validates it.
      ...localRange(query.get("from"), query.get("to")),
    });
    const body =
      format === "csv"
        ? new TextEncoder().encode(toCsv(table))
        : await this.services.renderPdf(table);
    return new Response(body as BodyInit, {
      headers: {
        "Content-Type":
          format === "csv" ? "text/csv; charset=utf-8" : "application/pdf",
        "Content-Length": String(body.byteLength),
        "Content-Disposition": `attachment; filename="${reportFileName(table, format)}"`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
        "Cross-Origin-Resource-Policy": "same-origin",
        "Referrer-Policy": "no-referrer",
      },
    });
  }
}
