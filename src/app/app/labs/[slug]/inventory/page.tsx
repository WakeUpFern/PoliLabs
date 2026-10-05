import Link from "next/link";
import { notFound } from "next/navigation";
import { AuthorizationDeniedError } from "@/modules/identity/domain/access-errors";
import { InventoryError } from "@/modules/inventory/domain/inventory";
import { inventoryWeb } from "@/modules/inventory/web/services";
import {
  TYPE_LABELS,
  UNIT_LABELS,
  locationLabel,
} from "@/modules/inventory/web/inventory-web";
export default async function InventoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ q?: string; type?: string; inactive?: string }>;
}) {
  const [{ slug }, filters] = await Promise.all([params, searchParams]);
  let data;
  try {
    data = await inventoryWeb.list(slug, {
      search: filters.q,
      type: filters.type,
      includeInactive: filters.inactive === "1",
    });
  } catch (error) {
    if (
      error instanceof AuthorizationDeniedError ||
      error instanceof InventoryError
    )
      notFound();
    throw error;
  }
  return (
    <div>
      <Link
        href={`/app/labs/${slug}`}
        className="text-sm font-semibold text-[#7a1731]"
      >
        ← {data.laboratory.name}
      </Link>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Inventario</h1>
          <p className="mt-3 text-stone-600">
            Busca materiales y herramientas de {data.laboratory.name}.
          </p>
        </div>
        {data.canManage && (
          <Link
            href={`/app/labs/${slug}/inventory/new`}
            className="rounded-xl bg-[#7a1731] px-5 py-3 font-semibold text-white"
          >
            Nuevo artículo
          </Link>
        )}
      </div>
      <form className="mt-8 flex flex-wrap items-end gap-4 rounded-2xl border border-stone-200 bg-white p-5">
        <label className="min-w-48 flex-1 font-medium">
          ¿Qué buscas?
          <input
            name="q"
            maxLength={200}
            defaultValue={filters.q}
            placeholder="Aceite, tornillos, destornillador…"
            className="mt-2 block w-full rounded-xl border border-stone-300 px-4 py-3"
          />
        </label>
        <label className="font-medium">
          Tipo
          <select
            name="type"
            defaultValue={filters.type ?? ""}
            className="mt-2 block rounded-xl border border-stone-300 px-4 py-3"
          >
            <option value="">Todos</option>
            {Object.entries(TYPE_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 py-3 text-sm">
          <input
            type="checkbox"
            name="inactive"
            value="1"
            defaultChecked={filters.inactive === "1"}
          />
          Incluir desactivados
        </label>
        <button className="rounded-xl bg-[#7a1731] px-5 py-3 font-semibold text-white">
          Buscar
        </button>
      </form>
      <p className="mt-5 text-sm text-stone-600">
        {data.items.length} artículos encontrados
      </p>
      {data.items.length === 0 ? (
        <p className="mt-4 rounded-2xl border border-dashed border-stone-300 p-8 text-stone-600">
          No hay artículos que coincidan. Revisa tu búsqueda o registra uno
          nuevo.
        </p>
      ) : (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {data.items.map((item) => (
            <article
              key={item.id}
              className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm"
            >
              <h2 className="text-xl font-semibold">{item.name}</h2>
              <p className="mt-2 text-stone-600">
                {TYPE_LABELS[item.type]} ·{" "}
                {item.isActive ? "Activo" : "Desactivado"}
              </p>
              <p className="mt-3 text-2xl font-semibold">
                {item.quantity}{" "}
                <span className="text-base font-normal">
                  {UNIT_LABELS[item.unit]}
                </span>
              </p>
              <p className="mt-2 text-sm text-stone-600">
                {locationLabel(item, data.locations)}
              </p>
              <Link
                href={`/app/labs/${slug}/inventory/${item.id}`}
                className="mt-5 inline-block font-semibold text-[#7a1731]"
              >
                Ver detalle y movimientos →
              </Link>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
