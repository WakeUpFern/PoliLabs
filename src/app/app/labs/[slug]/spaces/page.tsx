import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCurrentActor } from "@/app/_lib/current-actor";
import { AuthorizationDeniedError } from "@/modules/identity/domain/access-errors";
import { getLaboratoryBySlug } from "@/modules/identity/infrastructure/services";
import { listSpaces } from "@/modules/spatial/infrastructure/services";
import { createSpaceAction, deactivateSpaceAction } from "./actions";
import { DeactivateSpaceButton } from "./deactivate-space-button";
import { SpaceForm } from "./space-form";

type SpacesPageProps = { params: Promise<{ slug: string }> };

export default async function SpacesPage({ params }: SpacesPageProps) {
  const [{ slug }, { actorUserId }] = await Promise.all([
    params,
    requireCurrentActor(),
  ]);

  let laboratory;
  let catalog;
  try {
    laboratory = await getLaboratoryBySlug.execute({
      actorUserId,
      laboratorySlug: slug,
    });
    catalog = await listSpaces.execute({
      actorUserId,
      laboratoryId: laboratory.id,
    });
  } catch (error) {
    if (error instanceof AuthorizationDeniedError) notFound();
    throw error;
  }

  const createAction = createSpaceAction.bind(null, slug);

  return (
    <div>
      <Link
        href={`/app/labs/${slug}`}
        className="text-sm font-semibold text-stone-600 transition hover:text-[#7a1731]"
      >
        <span aria-hidden="true">←</span> {laboratory.name}
      </Link>

      <div className="mt-6 sm:flex sm:items-end sm:justify-between sm:gap-6">
        <div>
          <p className="text-sm font-semibold text-[#7a1731]">Spatial I</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
            Espacios
          </h1>
          <p className="mt-3 max-w-2xl leading-7 text-stone-600">
            Catálogo operativo de áreas pertenecientes a {laboratory.name}.
          </p>
        </div>
        <p className="mt-4 text-sm text-stone-500 sm:mt-0">
          {catalog.spaces.length}{" "}
          {catalog.spaces.length === 1 ? "activo" : "activos"}
        </p>
      </div>

      {catalog.canManage ? (
        <section className="mt-8 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
          <h2 className="text-xl font-semibold">Registrar espacio</h2>
          <p className="mt-2 text-sm leading-6 text-stone-600">
            La capacidad puede dejarse vacía hasta contar con el dato validado.
          </p>
          <SpaceForm action={createAction} submitLabel="Crear espacio" />
        </section>
      ) : null}

      <section className="mt-8">
        <h2 className="text-xl font-semibold">Espacios activos</h2>
        {catalog.spaces.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed border-stone-300 bg-stone-50 p-8 text-center text-stone-600">
            Todavía no hay espacios registrados.
          </div>
        ) : (
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            {catalog.spaces.map((space) => {
              const deactivateAction = deactivateSpaceAction.bind(
                null,
                slug,
                space.slug,
              );
              return (
                <article
                  key={space.id}
                  className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-lg font-semibold">{space.name}</h3>
                      <p className="mt-1 font-mono text-xs text-stone-500">
                        {space.slug}
                      </p>
                    </div>
                    <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">
                      Activo
                    </span>
                  </div>
                  <p className="mt-5 text-sm text-stone-600">
                    {space.capacity
                      ? `Capacidad: ${space.capacity} personas`
                      : "Capacidad no especificada"}
                  </p>
                  {catalog.canManage ? (
                    <div className="mt-5 flex items-center gap-4 border-t border-stone-100 pt-4">
                      <Link
                        href={`/app/labs/${slug}/spaces/${space.slug}/edit`}
                        className="text-sm font-semibold text-[#7a1731] transition hover:text-[#571020]"
                      >
                        Editar
                      </Link>
                      <DeactivateSpaceButton action={deactivateAction} />
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
