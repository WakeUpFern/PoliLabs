"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useTransition } from "react";

const FIELD =
  "mt-1.5 block w-full rounded-md border border-line bg-surface px-3 min-h-11 font-normal focus:outline-none focus:ring-4 focus:ring-guinda/20";

/**
 * Filters the list as the person types. The URL stays the source of truth,
 * so a filtered list can be shared, reloaded or opened from Back.
 */
export function InventorySearch({
  q,
  type,
  inactive,
  types,
}: {
  q: string;
  type: string;
  inactive: boolean;
  types: [string, string][];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const form = useRef<HTMLFormElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [pending, startTransition] = useTransition();

  useEffect(() => () => clearTimeout(timer.current), []);

  const apply = () => {
    clearTimeout(timer.current);
    if (!form.current) return;
    const data = new FormData(form.current);
    const search = new URLSearchParams();
    const text = String(data.get("q") ?? "").trim();
    if (text) search.set("q", text);
    if (data.get("type")) search.set("type", String(data.get("type")));
    if (data.get("inactive")) search.set("inactive", "1");
    const query = search.toString();
    startTransition(() =>
      router.replace(query ? `${pathname}?${query}` : pathname, {
        scroll: false,
      }),
    );
  };

  return (
    <form
      ref={form}
      role="search"
      aria-busy={pending}
      onSubmit={(event) => {
        event.preventDefault();
        apply();
      }}
      className="mt-6 flex flex-wrap items-end gap-x-4 gap-y-3"
    >
      <label className="min-w-48 flex-1 text-sm font-semibold">
        ¿Qué buscas?
        <input
          type="search"
          name="q"
          maxLength={200}
          defaultValue={q}
          placeholder="Aceite, tornillos, destornillador…"
          onChange={() => {
            clearTimeout(timer.current);
            timer.current = setTimeout(apply, 300);
          }}
          className={FIELD}
        />
      </label>
      <label className="text-sm font-semibold">
        Tipo
        <select
          name="type"
          defaultValue={type}
          onChange={apply}
          className={FIELD}
        >
          <option value="">Todos</option>
          {types.map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="inactive"
          value="1"
          defaultChecked={inactive}
          onChange={apply}
        />
        Incluir desactivados
      </label>
      <button type="submit" className="sr-only">
        Buscar
      </button>
    </form>
  );
}
