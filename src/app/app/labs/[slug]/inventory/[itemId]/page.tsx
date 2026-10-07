import Link from "next/link";
import { notFound } from "next/navigation";
import { AuthorizationDeniedError } from "@/modules/identity/domain/access-errors";
import { InventoryError } from "@/modules/inventory/domain/inventory";
import { inventoryWeb } from "@/modules/inventory/web/services";
import {
  TYPE_LABELS,
  UNIT_LABELS,
  MOVEMENT_LABELS,
  locationLabel,
} from "@/modules/inventory/web/inventory-web";
import { InventoryForm } from "../inventory-form";
import { ItemLoans } from "../../loans/item-loans";
export default async function InventoryDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; itemId: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const [{ slug, itemId }, feedback] = await Promise.all([
    params,
    searchParams,
  ]);
  let data;
  try {
    data = await inventoryWeb.detail(slug, itemId);
  } catch (error) {
    if (
      error instanceof AuthorizationDeniedError ||
      error instanceof InventoryError
    )
      notFound();
    throw error;
  }
  const { item } = data;
  return (
    <div>
      <Link
        href={`/app/labs/${slug}/inventory`}
        className="font-semibold text-[#7a1731]"
      >
        ← Inventario
      </Link>
      {feedback.created === "1" && (
        <p
          role="status"
          className="mt-5 rounded-xl bg-green-50 p-4 text-green-800"
        >
          Artículo registrado.
        </p>
      )}
      <h1 className="mt-6 text-3xl font-semibold">{item.name}</h1>
      <p className="mt-3 text-stone-600">
        {TYPE_LABELS[item.type]} · {item.isActive ? "Activo" : "Desactivado"}
      </p>
      <section className="mt-6 rounded-2xl bg-[#641229] p-7 text-white">
        <h2 className="text-sm uppercase tracking-wide">Existencia actual</h2>
        <p className="mt-3 text-4xl font-semibold">
          {item.quantity} {UNIT_LABELS[item.unit]}
        </p>
        <p className="mt-4">{locationLabel(item, data.locations)}</p>
        {item.type === "reusable_tool" && (
          <p className="mt-3 text-sm text-white/80">
            Cantidad total registrada, incluidas las piezas prestadas.
          </p>
        )}
      </section>
      <ItemLoans slug={slug} itemId={item.id} />
      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        {item.isActive && data.canAdjust && (
          <section className="rounded-2xl border border-stone-200 bg-white p-6">
            <h2 className="mb-5 text-xl font-semibold">Registrar movimiento</h2>
            <InventoryForm slug={slug} mode="movement" item={item} />
          </section>
        )}
        {item.isActive && data.canManage && (
          <section className="rounded-2xl border border-stone-200 bg-white p-6">
            <h2 className="mb-5 text-xl font-semibold">Editar artículo</h2>
            <InventoryForm
              slug={slug}
              mode="update"
              item={item}
              locations={data.locations}
              hasHistory={data.movements.length > 0}
            />
          </section>
        )}
      </div>
      <section className="mt-8">
        <h2 className="text-xl font-semibold">Historial de movimientos</h2>
        {data.movements.length === 0 ? (
          <p className="mt-4 text-stone-600">Todavía no hay movimientos.</p>
        ) : (
          <div className="mt-4 space-y-3">
            {data.movements.map((movement) => (
              <article
                key={movement.id}
                className="rounded-2xl border border-stone-200 bg-white p-5"
              >
                <div className="flex flex-wrap justify-between gap-3">
                  <h3 className="font-semibold">
                    {MOVEMENT_LABELS[movement.type]} · {movement.quantity}{" "}
                    {UNIT_LABELS[item.unit]}
                  </h3>
                  <time
                    dateTime={movement.createdAt}
                    className="text-sm text-stone-600"
                  >
                    {new Intl.DateTimeFormat("es-MX", {
                      dateStyle: "medium",
                      timeStyle: "short",
                      timeZone: "America/Mexico_City",
                    }).format(new Date(movement.createdAt))}
                  </time>
                </div>
                <p className="mt-2">{movement.notes}</p>
                <p className="mt-2 text-sm text-stone-600">
                  Saldo: {movement.quantityBefore} → {movement.quantityAfter}{" "}
                  {UNIT_LABELS[item.unit]}
                </p>
                <p className="mt-2 text-sm text-stone-600">
                  {locationLabel(movement, data.locations)} · Origen:{" "}
                  {movement.source}
                </p>
                <p className="mt-2 break-all text-xs text-stone-500">
                  Actor: {movement.actorUserId}
                </p>
              </article>
            ))}
          </div>
        )}
      </section>
      {item.isActive && data.canManage && (
        <section className="mt-8 rounded-2xl border border-stone-200 p-6">
          <h2 className="mb-5 text-xl font-semibold">Desactivar artículo</h2>
          <InventoryForm slug={slug} mode="deactivate" item={item} />
        </section>
      )}
    </div>
  );
}
