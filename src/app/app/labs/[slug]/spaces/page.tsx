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
      <h1 className="text-2xl font-semibold">Espacios</h1>
      <p className="mt-2 text-muted">
        {catalog.spaces.length === 1
          ? "1 espacio activo"
          : `${catalog.spaces.length} espacios activos`}{" "}
        en {laboratory.name}.
      </p>

      <section className="mt-6">
        {catalog.spaces.length === 0 ? (
          <div className="empty-state">
            Todavía no hay espacios registrados.
          </div>
        ) : (
          <ul className="box divide-y divide-line">
            {catalog.spaces.map((space) => {
              const deactivateAction = deactivateSpaceAction.bind(
                null,
                slug,
                space.slug,
              );
              return (
                <li
                  key={space.id}
                  className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-5 py-4"
                >
                  <div className="min-w-0">
                    <h2 className="font-semibold">
                      <Link
                        href={`/app/labs/${slug}/spaces/${space.slug}`}
                        className="hover:underline"
                      >
                        {space.name}
                      </Link>
                    </h2>
                    <p className="mt-0.5 text-sm text-muted">
                      {space.capacity
                        ? `Capacidad: ${space.capacity} personas`
                        : "Capacidad no especificada"}
                    </p>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <Link
                      href={`/app/labs/${slug}/spaces/${space.slug}`}
                      className="font-semibold text-guinda hover:underline"
                    >
                      Abrir organización física
                    </Link>
                    {catalog.canManage ? (
                      <>
                        <Link
                          href={`/app/labs/${slug}/spaces/${space.slug}/edit`}
                          className="font-semibold text-guinda hover:underline"
                        >
                          Editar
                        </Link>
                        <DeactivateSpaceButton action={deactivateAction} />
                      </>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {catalog.canManage ? (
        <details className="mt-8 box p-5" open={catalog.spaces.length === 0}>
          <summary className="cursor-pointer font-semibold">
            Registrar espacio
          </summary>
          <p className="mt-3 text-sm leading-6 text-muted">
            La capacidad puede dejarse vacía hasta contar con el dato validado.
          </p>
          <SpaceForm action={createAction} submitLabel="Crear espacio" />
        </details>
      ) : null}
    </div>
  );
}
