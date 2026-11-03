import Link from "next/link";
import { ReportDownloads } from "../reports/report-downloads";
import { InventorySearch } from "./inventory-search";
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold sm:text-3xl">Inventario</h1>
        <div className="flex flex-wrap gap-2">
          <ReportDownloads
            slug={slug}
            reports={["inventory-stock", "inventory-movements"]}
            align="end"
          />
          {data.canManage && (
            <Link
              href={`/app/labs/${slug}/inventory/new`}
              className="btn btn-primary"
            >
              Nuevo artículo
            </Link>
          )}
        </div>
      </div>
      <InventorySearch
        q={filters.q ?? ""}
        type={filters.type ?? ""}
        inactive={filters.inactive === "1"}
        types={Object.entries(TYPE_LABELS)}
      />
      <p className="mt-5 text-sm text-muted">
        {data.items.length} artículos encontrados
      </p>
      {data.items.length === 0 ? (
        <p className="mt-4 rounded-md border border-dashed border-line p-8 text-muted">
          No hay artículos que coincidan. Revisa tu búsqueda o registra uno
          nuevo.
        </p>
      ) : (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {data.items.map((item) => (
            <article
              key={item.id}
              className="rounded-md border border-line bg-surface p-6 shadow-sm"
            >
              <h2 className="text-xl font-semibold">{item.name}</h2>
              <p className="mt-2 text-muted">
                {TYPE_LABELS[item.type]} ·{" "}
                {item.isActive ? "Activo" : "Desactivado"}
              </p>
              <p className="mt-3 text-2xl font-semibold">
                {item.quantity}{" "}
                <span className="text-base font-normal">
                  {UNIT_LABELS[item.unit]}
                </span>
              </p>
              <p className="mt-2 text-sm text-muted">
                {locationLabel(item, data.locations)}
              </p>
              <Link
                href={`/app/labs/${slug}/inventory/${item.id}`}
                className="mt-5 inline-block font-semibold text-guinda"
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
