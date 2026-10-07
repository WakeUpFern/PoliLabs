"use client";
import { useActionState, useRef, useState, useTransition } from "react";
import {
  RETURN_CONDITION_LABELS,
  type LoanActionState,
} from "@/modules/loans/web/loans-web";
import { lendAction, returnAction } from "./actions";
const field =
  "mt-2 block w-full rounded-xl border border-stone-300 bg-white p-3";
const button =
  "rounded-xl bg-[#7a1731] px-5 py-3 font-semibold text-white disabled:opacity-50";
const idle: LoanActionState = { status: "idle", message: "" };
// Submit through a transition so fields survive errors; reset only after success.
function useLoanAction(
  submit: (
    previous: LoanActionState,
    form: FormData,
  ) => Promise<LoanActionState>,
) {
  const formRef = useRef<HTMLFormElement>(null);
  const [, startTransition] = useTransition();
  const [state, action, pending] = useActionState(
    async (previous: LoanActionState, form: FormData) => {
      const result = await submit(previous, form);
      if (result.status === "success") formRef.current?.reset();
      return result;
    },
    idle,
  );
  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    startTransition(() => action(form));
  };
  return { formRef, state, pending, onSubmit };
}
function Feedback({ state }: { state: LoanActionState }) {
  return state.message ? (
    <p
      role={state.status === "error" ? "alert" : "status"}
      className={state.status === "error" ? "text-red-700" : "text-green-800"}
    >
      {state.message}
    </p>
  ) : null;
}
export function LendForm({
  slug,
  itemId,
  available,
  minDueLocal,
  members,
  sessions,
}: {
  slug: string;
  itemId: string;
  available: number;
  minDueLocal: string;
  members: { id: string; name: string }[];
  sessions: { id: string; label: string }[];
}) {
  const { formRef, state, pending, onSubmit } = useLoanAction(
    lendAction.bind(null, slug, itemId),
  );
  return (
    <form ref={formRef} className="space-y-4" onSubmit={onSubmit}>
      <fieldset disabled={pending} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            Persona que recibe
            <select
              name="borrowerUserId"
              required
              defaultValue=""
              className={field}
            >
              <option value="" disabled>
                Selecciona un miembro activo
              </option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            Piezas
            <input
              name="quantity"
              type="number"
              required
              min={1}
              max={Math.max(available, 1)}
              step={1}
              defaultValue={1}
              className={field}
            />
          </label>
          <label className="block">
            Fecha compromiso (opcional)
            <input
              type="datetime-local"
              name="dueLocal"
              min={minDueLocal}
              className={field}
            />
          </label>
          <label className="block">
            Sesión académica (opcional)
            <select name="sessionId" defaultValue="" className={field}>
              <option value="">Sin sesión</option>
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="block">
          Notas (opcional)
          <textarea name="notes" maxLength={1000} rows={2} className={field} />
        </label>
        <button type="submit" className={button}>
          {pending ? "Registrando…" : "Registrar préstamo"}
        </button>
      </fieldset>
      <Feedback state={state} />
    </form>
  );
}
export function ReturnForm({
  slug,
  itemId,
  loanId,
  outstanding,
  canAdjust,
}: {
  slug: string;
  itemId: string;
  loanId: string;
  outstanding: number;
  canAdjust: boolean;
}) {
  const { formRef, state, pending, onSubmit } = useLoanAction(
    returnAction.bind(null, slug, itemId),
  );
  const [condition, setCondition] = useState("good");
  return (
    <form ref={formRef} className="mt-4 space-y-3" onSubmit={onSubmit}>
      <input type="hidden" name="loanId" value={loanId} />
      <fieldset
        disabled={pending}
        className="grid gap-3 sm:grid-cols-[8rem_1fr]"
      >
        <label className="block">
          Piezas
          <input
            name="quantity"
            type="number"
            required
            min={1}
            max={outstanding}
            step={1}
            defaultValue={outstanding}
            className={field}
          />
        </label>
        <label className="block">
          Estado al devolver
          <select
            name="condition"
            value={condition}
            onChange={(e) => setCondition(e.target.value)}
            className={field}
          >
            {Object.entries(RETURN_CONDITION_LABELS)
              .filter(([value]) => canAdjust || value === "good")
              .map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
          </select>
        </label>
        <label className="block sm:col-span-2">
          Notas{condition === "good" ? " (opcional)" : ""}
          <textarea
            name="notes"
            maxLength={1000}
            rows={2}
            required={condition !== "good"}
            className={field}
          />
        </label>
        {condition !== "good" ? (
          <p className="text-sm text-stone-600 sm:col-span-2">
            Se registrará un movimiento de{" "}
            {condition === "damaged" ? "daño" : "pérdida"} que reduce la
            existencia en la misma operación.
          </p>
        ) : null}
        <div className="sm:col-span-2">
          <button type="submit" className={button}>
            {pending ? "Registrando…" : "Registrar devolución"}
          </button>
        </div>
      </fieldset>
      {!canAdjust ? (
        <p className="text-sm text-stone-600">
          Registrar daño o pérdida requiere el permiso de movimientos de
          inventario.
        </p>
      ) : null}
      <Feedback state={state} />
    </form>
  );
}
