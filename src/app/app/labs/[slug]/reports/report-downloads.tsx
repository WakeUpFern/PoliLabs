import { Download } from "lucide-react";
import type { ReportKey } from "@/modules/reports/domain/reports";
import { reportsWeb } from "@/modules/reports/web/services";
import { ReportForm } from "./report-form";

// Section shortcut to the same exports as /reports; renders nothing when the
// actor holds none of the listed reports' permissions.
export async function ReportDownloads({
  slug,
  reports,
  align = "start",
}: {
  slug: string;
  reports: ReportKey[];
  /** Which edge of the button the panel lines up with. */
  align?: "start" | "end";
}) {
  const data = await reportsWeb.page(slug, reports);
  if (!data.reports.length) return null;
  return (
    <details className={`relative ${align === "start" ? "mt-4" : ""}`}>
      <summary className="btn list-none [&::-webkit-details-marker]:hidden">
        <Download aria-hidden className="size-4" />
        Exportar
      </summary>
      <div
        className={`absolute z-20 mt-2 w-[min(44rem,calc(100vw-2rem))] rounded-md border border-line bg-surface p-4 shadow-lg ${align === "end" ? "right-0" : "left-0"}`}
      >
        <div className="grid gap-4 lg:grid-cols-2">
          {data.reports.map((report) => (
            <ReportForm
              key={report.key}
              slug={slug}
              report={report}
              defaults={data.defaults}
              compact
            />
          ))}
        </div>
      </div>
    </details>
  );
}
