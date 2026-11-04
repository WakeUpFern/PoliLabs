import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCurrentActor } from "@/app/_lib/current-actor";
import { AuthorizationDeniedError } from "@/modules/identity/domain/access-errors";
import { getLaboratoryBySlug } from "@/modules/identity/infrastructure/services";
import { SpaceNotFoundError } from "@/modules/spatial/domain/space";
import {
  getSpace,
  listSpaces,
} from "@/modules/spatial/infrastructure/services";
import { updateSpaceAction } from "../../actions";
import { SpaceForm } from "../../space-form";

type EditSpacePageProps = {
  params: Promise<{ slug: string; spaceSlug: string }>;
};

export default async function EditSpacePage({ params }: EditSpacePageProps) {
  const [{ slug, spaceSlug }, { actorUserId }] = await Promise.all([
    params,
    requireCurrentActor(),
  ]);

  let laboratory;
  let space;
  try {
    laboratory = await getLaboratoryBySlug.execute({
      actorUserId,
      laboratorySlug: slug,
    });
    const [catalog, resolvedSpace] = await Promise.all([
      listSpaces.execute({ actorUserId, laboratoryId: laboratory.id }),
      getSpace.execute({
        actorUserId,
        laboratoryId: laboratory.id,
        slug: spaceSlug,
      }),
    ]);
    if (!catalog.canManage) notFound();
    space = resolvedSpace;
  } catch (error) {
    if (
      error instanceof AuthorizationDeniedError ||
      error instanceof SpaceNotFoundError
    )
      notFound();
    throw error;
  }

  const updateAction = updateSpaceAction.bind(null, slug, spaceSlug);

  return (
    <div className="max-w-3xl">
      <Link
        href={`/app/labs/${slug}/spaces`}
        className="text-sm font-semibold text-muted transition hover:text-guinda"
      >
        <span aria-hidden="true">←</span> Espacios
      </Link>
      <h1 className="mt-6 text-2xl font-semibold">Editar espacio</h1>
      <section className="mt-6 box p-6">
        <SpaceForm
          action={updateAction}
          submitLabel="Guardar cambios"
          space={{
            name: space.name,
            slug: space.slug,
            capacity: space.capacity,
          }}
        />
      </section>
    </div>
  );
}
