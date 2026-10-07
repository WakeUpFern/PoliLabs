import Link from "next/link";
import type { Loan } from "@/modules/loans/domain/loans";
import { RETURN_CONDITION_LABELS } from "@/modules/loans/web/loans-web";
import { formatAcademicTime } from "@/modules/academic/web/time";
import { ReturnForm } from "./loan-forms";
const pieces = (value: string) => `${Number(value)} pz`;
export function LoanCard({
  loan,
  slug,
  showItem = false,
  linkItem = false,
  returnForm = null,
}: {
  loan: Loan;
  slug: string;
  showItem?: boolean;
  linkItem?: boolean;
  returnForm?: { canAdjust: boolean } | null;
}) {
  return (
    <article className="rounded-2xl border border-stone-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h3 className="font-semibold break-words">
          {showItem && linkItem ? (
            <Link
              href={`/app/labs/${slug}/inventory/${loan.itemId}`}
              className="text-[#7a1731]"
            >
              {loan.itemName}
            </Link>
          ) : showItem ? (
            loan.itemName
          ) : (
            loan.borrowerName
          )}{" "}
          · {pieces(loan.quantity)}
        </h3>
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${
            loan.overdue
              ? "bg-red-100 text-red-800"
              : loan.status === "active"
                ? "bg-amber-100 text-amber-900"
                : "bg-stone-100 text-stone-700"
          }`}
        >
          {loan.overdue
            ? "Vencido"
            : loan.status === "active"
              ? `Pendientes: ${pieces(loan.outstanding)}`
              : "Devuelto"}
        </span>
      </div>
      <dl className="mt-3 grid gap-1 text-sm text-stone-700 sm:grid-cols-2">
        {showItem ? <div>Recibe: {loan.borrowerName}</div> : null}
        <div>Prestado: {formatAcademicTime(loan.loanedAt)}</div>
        <div>
          Compromiso:{" "}
          {loan.dueAt ? formatAcademicTime(loan.dueAt) : "Sin fecha"}
        </div>
        {loan.closedAt ? (
          <div>Cerrado: {formatAcademicTime(loan.closedAt)}</div>
        ) : null}
        {loan.sessionLabel ? <div>Sesión: {loan.sessionLabel}</div> : null}
        <div>
          Registró: {loan.actorName} · {loan.source}
        </div>
      </dl>
      {loan.notes ? <p className="mt-2 text-sm">{loan.notes}</p> : null}
      {loan.returns.length ? (
        <ul className="mt-3 space-y-1 border-t border-stone-100 pt-3 text-sm">
          {loan.returns.map((r) => (
            <li key={r.id}>
              {formatAcademicTime(r.returnedAt)} · {pieces(r.quantity)}{" "}
              {RETURN_CONDITION_LABELS[r.condition].toLowerCase()} ·{" "}
              {r.actorName}
              {r.notes ? ` · ${r.notes}` : ""}
            </li>
          ))}
        </ul>
      ) : null}
      {returnForm && loan.status === "active" ? (
        <ReturnForm
          slug={slug}
          itemId={loan.itemId}
          loanId={loan.id}
          outstanding={Number(loan.outstanding)}
          canAdjust={returnForm.canAdjust}
        />
      ) : null}
    </article>
  );
}
