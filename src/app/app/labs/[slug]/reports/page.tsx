import Link from "next/link";
import { notFound } from "next/navigation";
import { AuthorizationDeniedError } from "@/modules/identity/domain/access-errors";
import { REPORT_TIME_ZONE } from "@/modules/reports/domain/reports";
import { REPORT_ERROR_MESSAGES } from "@/modules/reports/web/reports-web";
import { reportsWeb } from "@/modules/reports/web/services";

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
  const field =
    "mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-sm";
  const button =
    "rounded-xl bg-[#7a1731] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#651128]";
  return (
    <div>
      <Link href={`/app/labs/${slug}`}>← Laboratorio</Link>
      <h1 className="mt-6 text-3xl font-semibold">Reportes</h1>
      <p className="mt-3 text-stone-600">
        Exporta información del laboratorio en CSV o PDF. Cada reporte se genera
        al momento con tus permisos actuales; las fechas usan la hora de{" "}
        {REPORT_TIME_ZONE} y el periodo incluye ambos días.
      </p>
      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        {data.reports.map((report) => (
          <section
            key={report.key}
            aria-labelledby={`report-${report.key}`}
            className="rounded-2xl border border-stone-200 bg-white p-5 sm:p-6"
          >
            <h2 id={`report-${report.key}`} className="text-lg font-semibold">
              {report.title}
            </h2>
            <p className="mt-2 text-sm leading-6 text-stone-600">
              {report.description}
            </p>
            <form
              method="get"
              action={`/app/labs/${slug}/reports/${report.key}`}
              className="mt-4"
            >
              {failure && query.report === report.key ? (
                <p
                  role="alert"
                  className="mb-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800"
                >
                  {failure}
                </p>
              ) : null}
              {report.period ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-sm font-medium">
                    Desde
                    <input
                      type="date"
                      name="from"
                      required
                      defaultValue={data.defaults.from}
                      className={field}
                    />
                  </label>
                  <label className="text-sm font-medium">
                    Hasta
                    <input
                      type="date"
                      name="to"
                      required
                      defaultValue={data.defaults.to}
                      className={field}
                    />
                  </label>
                </div>
              ) : null}
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="submit"
                  name="format"
                  value="csv"
                  className={button}
                >
                  Descargar CSV
                </button>
                <button
                  type="submit"
                  name="format"
                  value="pdf"
                  className={button}
                >
                  Descargar PDF
                </button>
              </div>
            </form>
          </section>
        ))}
      </div>
    </div>
  );
}
