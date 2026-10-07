import type { ReportKey } from "@/modules/reports/domain/reports";
import { reportsWeb } from "@/modules/reports/web/services";
import { ReportForm } from "./report-form";

// Section shortcut to the same exports as /reports; renders nothing when the
// actor holds none of the listed reports' permissions.
export async function ReportDownloads({
  slug,
  reports,
}: {
  slug: string;
  reports: ReportKey[];
}) {
  const data = await reportsWeb.page(slug, reports);
  if (!data.reports.length) return null;
  return (
    <details className="mt-6 rounded-2xl border border-stone-200 bg-white p-4 sm:p-5">
      <summary className="cursor-pointer font-semibold text-[#7a1731]">
        Exportar CSV / PDF
      </summary>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
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
    </details>
  );
}
