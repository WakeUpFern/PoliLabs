import Link from "next/link";
import { notFound } from "next/navigation";
import { AuthorizationDeniedError } from "@/modules/identity/domain/access-errors";
import { inventoryWeb } from "@/modules/inventory/web/services";
import { InventoryForm } from "../inventory-form";
export default async function NewInventoryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  let data;
  try {
    data = await inventoryWeb.newForm(slug);
  } catch (error) {
    if (error instanceof AuthorizationDeniedError) notFound();
    throw error;
  }
  return (
    <div className="max-w-3xl">
      <Link
        href={`/app/labs/${slug}/inventory`}
        className="font-semibold text-[#7a1731]"
      >
        ← Inventario
      </Link>
      <h1 className="mt-6 text-3xl font-semibold">Nuevo artículo</h1>
      <p className="mt-3 text-stone-600">
        Antes de registrar, busca si el artículo ya existe. Si llegó más
        material, registra una entrada en su detalle.
      </p>
      <section className="mt-8 rounded-2xl border border-stone-200 bg-white p-6">
        <InventoryForm
          slug={slug}
          mode="create"
          locations={data.locations}
          canAdjust={data.canAdjust}
        />
      </section>
    </div>
  );
}
