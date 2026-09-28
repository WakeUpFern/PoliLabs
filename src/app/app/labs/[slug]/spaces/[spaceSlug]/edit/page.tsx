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
        className="text-sm font-semibold text-stone-600 transition hover:text-[#7a1731]"
      >
        <span aria-hidden="true">←</span> Espacios
      </Link>
      <p className="mt-7 text-sm font-semibold text-[#7a1731]">
        {laboratory.name}
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
        Editar espacio
      </h1>
      <section className="mt-8 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
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
