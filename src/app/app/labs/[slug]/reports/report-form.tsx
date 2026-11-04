import type { ReportDefinition } from "@/modules/reports/domain/reports";

const field = "mt-1 w-full rounded-md border border-line px-3 py-2 text-sm";
const button = "btn";

// Native GET form: the route handler answers with an attachment, so the page
// stays in place and no client JavaScript is needed.
export function ReportForm({
  slug,
  report,
  defaults,
  failure,
  compact = false,
}: {
  slug: string;
  report: ReportDefinition;
  defaults: { from: string; to: string };
  failure?: string | null;
  compact?: boolean;
}) {
  const Heading = compact ? "h3" : "h2";
  return (
    <section
      aria-labelledby={`report-${report.key}`}
      className={
        compact
          ? "rounded-md border border-line p-4"
          : "rounded-md border border-line bg-surface p-5 sm:p-6"
      }
    >
      <Heading
        id={`report-${report.key}`}
        className={compact ? "font-semibold" : "text-lg font-semibold"}
      >
        {report.title}
      </Heading>
      <p className="mt-2 text-sm leading-6 text-muted">{report.description}</p>
      <form
        method="get"
        action={`/app/labs/${slug}/reports/${report.key}`}
        className="mt-4"
      >
        {failure ? (
          <p
            role="alert"
            className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800"
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
                defaultValue={defaults.from}
                className={field}
              />
            </label>
            <label className="text-sm font-medium">
              Hasta
              <input
                type="date"
                name="to"
                required
                defaultValue={defaults.to}
                className={field}
              />
            </label>
          </div>
        ) : null}
        <div className="mt-4 flex flex-wrap gap-3">
          <button type="submit" name="format" value="csv" className={button}>
            Descargar CSV
          </button>
          <button type="submit" name="format" value="pdf" className={button}>
            Descargar PDF
          </button>
        </div>
      </form>
    </section>
  );
}
