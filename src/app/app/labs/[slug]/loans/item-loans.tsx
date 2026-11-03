import Link from "next/link";
import { loansWeb } from "@/modules/loans/web/services";
import { formatTime, instantToLocal } from "@/shared/time";
import { LendForm } from "./loan-forms";
import { LoanCard } from "./loan-views";
// Loans section of the inventory item detail; the parent page already
// authorized inventory.read for this item.
export async function ItemLoans({
  slug,
  itemId,
}: {
  slug: string;
  itemId: string;
}) {
  const { summary, loans, access, options } = await loansWeb.item(slug, itemId);
  if (summary.itemType !== "reusable_tool") return null;
  const active = loans?.filter((l) => l.status === "active") ?? [];
  const closed = loans?.filter((l) => l.status !== "active") ?? [];
  return (
    <section className="mt-8 space-y-6">
      <div className="grid gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-3">
        {[
          ["Existencia", summary.stock],
          ["Prestadas", summary.loaned],
          ["Disponibles", summary.available],
        ].map(([label, value]) => (
          <div key={label} className="bg-surface p-5">
            <p className="text-xs uppercase tracking-wide text-muted">
              {label}
            </p>
            <p className="mt-1 text-2xl font-semibold">{Number(value)} pz</p>
          </div>
        ))}
      </div>
      <p className="text-sm text-muted">
        Un préstamo no es consumo: la existencia conserva las piezas prestadas y
        la disponibilidad descuenta las que siguen fuera.
        {access.canManage ? (
          <>
            {" "}
            <Link
              href={`/app/labs/${slug}/loans`}
              className="font-semibold text-guinda"
            >
              Ver préstamos del laboratorio
            </Link>
          </>
        ) : null}
      </p>
      {options ? (
        <div className="rounded-md border border-line bg-surface p-6">
          <h2 className="mb-5 text-xl font-semibold">Registrar préstamo</h2>
          {Number(summary.available) > 0 ? (
            <LendForm
              slug={slug}
              itemId={itemId}
              available={Number(summary.available)}
              minDueLocal={instantToLocal(new Date())}
              members={options.members}
              sessions={options.sessions.map((s) => ({
                id: s.id,
                label: `${s.label} · ${formatTime(s.startsAt)}`,
              }))}
            />
          ) : (
            <p>No hay piezas disponibles para prestar.</p>
          )}
        </div>
      ) : null}
      {loans ? (
        <div>
          <h2 className="text-xl font-semibold">Préstamos activos</h2>
          <div className="mt-4 space-y-3">
            {active.map((loan) => (
              <LoanCard
                key={loan.id}
                loan={loan}
                slug={slug}
                returnForm={{ canAdjust: access.canAdjust }}
              />
            ))}
            {!active.length ? (
              <p className="text-muted">No hay préstamos activos.</p>
            ) : null}
          </div>
          {closed.length ? (
            <>
              <h2 className="mt-8 text-xl font-semibold">
                Préstamos devueltos recientes
              </h2>
              <div className="mt-4 space-y-3">
                {closed.map((loan) => (
                  <LoanCard key={loan.id} loan={loan} slug={slug} />
                ))}
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
