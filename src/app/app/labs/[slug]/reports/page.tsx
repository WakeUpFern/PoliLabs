import { notFound } from "next/navigation";
import { AuthorizationDeniedError } from "@/modules/identity/domain/access-errors";
import { REPORT_ERROR_MESSAGES } from "@/modules/reports/web/reports-web";
import { reportsWeb } from "@/modules/reports/web/services";
import { ReportForm } from "./report-form";

export default async function ReportsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ report?: string; error?: string }>;
}) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  let data;
  try {
    data = await reportsWeb.page(slug);
  } catch (error) {
    if (error instanceof AuthorizationDeniedError) notFound();
    throw error;
  }
  if (!data.reports.length) notFound();
  const failure =
    query.error && query.error in REPORT_ERROR_MESSAGES
      ? REPORT_ERROR_MESSAGES[query.error as keyof typeof REPORT_ERROR_MESSAGES]
      : null;
  return (
    <div>
      <h1 className="text-2xl font-semibold">Reportes</h1>
      <p className="mt-2 max-w-3xl text-muted">
        Descarga la información del laboratorio en CSV o PDF. Cada reporte se
        genera al momento, en hora de Ciudad de México, e incluye los dos días
        del periodo.
      </p>
      <div className="mt-6 grid items-start gap-4 lg:grid-cols-2">
        {data.reports.map((report) => (
          <ReportForm
            key={report.key}
            slug={slug}
            report={report}
            defaults={data.defaults}
            failure={query.report === report.key ? failure : null}
          />
        ))}
      </div>
    </div>
  );
}
