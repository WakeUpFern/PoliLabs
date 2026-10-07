import Link from "next/link";
import { notFound } from "next/navigation";
import { AuthorizationDeniedError } from "@/modules/identity/domain/access-errors";
import { REPORT_TIME_ZONE } from "@/modules/reports/domain/reports";
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
      <Link href={`/app/labs/${slug}`}>← Laboratorio</Link>
      <h1 className="mt-6 text-3xl font-semibold">Reportes</h1>
      <p className="mt-3 text-stone-600">
        Exporta información del laboratorio en CSV o PDF. Cada reporte se genera
        al momento con tus permisos actuales; las fechas usan la hora de{" "}
        {REPORT_TIME_ZONE} y el periodo incluye ambos días. Inventario,
        Préstamos, Mantenimiento e Incidencias ofrecen las mismas descargas en
        su propia sección.
      </p>
      <div className="mt-8 grid gap-4 lg:grid-cols-2">
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
