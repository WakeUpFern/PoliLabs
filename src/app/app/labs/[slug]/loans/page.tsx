import Link from "next/link";
import { ReportDownloads } from "../reports/report-downloads";
import { notFound } from "next/navigation";
import { AuthorizationDeniedError } from "@/modules/identity/domain/access-errors";
import { LoanError } from "@/modules/loans/domain/loans";
import { loansWeb } from "@/modules/loans/web/services";
import { LoanCard } from "./loan-views";
export default async function LoansPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ filter?: string }>;
}) {
  const [{ slug }, { filter }] = await Promise.all([params, searchParams]);
  let data;
  try {
    data = await loansWeb.page(slug, filter ?? null);
  } catch (error) {
    if (
      error instanceof AuthorizationDeniedError ||
      (error instanceof LoanError && error.code === "input")
    )
      notFound();
    throw error;
  }
  const overdueOnly = filter === "overdue";
  const tab = (active: boolean) =>
    `rounded-full px-4 py-2 text-sm font-semibold ${
      active ? "bg-[#7a1731] text-white" : "border border-stone-300"
    }`;
  return (
    <div>
      <Link href={`/app/labs/${slug}`}>← Laboratorio</Link>
      <h1 className="mt-6 text-3xl font-semibold">Préstamos</h1>
      <p className="mt-3 text-stone-600">
        Herramientas reutilizables prestadas temporalmente. Los préstamos se
        registran y devuelven desde el detalle de cada artículo de inventario.
        Un préstamo vencido es uno activo cuya fecha compromiso ya pasó; no se
        envían notificaciones.
      </p>
      {data.laboratory ? (
        <section className="mt-8">
          <h2 className="text-xl font-semibold">Préstamos del laboratorio</h2>
          <nav className="mt-4 flex flex-wrap gap-2" aria-label="Filtro">
            <Link
              href={`/app/labs/${slug}/loans`}
              className={tab(!overdueOnly)}
            >
              Activos
            </Link>
            <Link
              href={`/app/labs/${slug}/loans?filter=overdue`}
              className={tab(overdueOnly)}
            >
              Vencidos
            </Link>
          </nav>
          <ReportDownloads slug={slug} reports={["loans"]} />
          <div className="mt-4 space-y-3">
            {data.laboratory.map((loan) => (
              <LoanCard
                key={loan.id}
                loan={loan}
                slug={slug}
                showItem
                linkItem={data.access.canReadInventory}
              />
            ))}
            {!data.laboratory.length ? (
              <p className="text-stone-600">
                {overdueOnly
                  ? "No hay préstamos vencidos."
                  : "No hay préstamos activos."}
              </p>
            ) : null}
          </div>
        </section>
      ) : null}
      {data.own ? (
        <section className="mt-10">
          <h2 className="text-xl font-semibold">Mis préstamos</h2>
          <div className="mt-4 space-y-3">
            {data.own.map((loan) => (
              <LoanCard
                key={loan.id}
                loan={loan}
                slug={slug}
                showItem
                linkItem={data.access.canReadInventory}
              />
            ))}
            {!data.own.length ? (
              <p className="text-stone-600">No tienes préstamos registrados.</p>
            ) : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}
