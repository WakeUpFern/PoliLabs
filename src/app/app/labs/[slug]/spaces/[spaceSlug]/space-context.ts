import "server-only";
import { requireCurrentActor } from "@/app/_lib/current-actor";
import { getLaboratoryBySlug } from "@/modules/identity/infrastructure/services";
import { getSpace } from "@/modules/spatial/infrastructure/services";

// Server actions of a space resolve identity and scope from the URL, never the form.
export async function resolveSpaceContext(
  laboratorySlug: string,
  spaceSlug: string,
) {
  const { actorUserId } = await requireCurrentActor();
  const laboratory = await getLaboratoryBySlug.execute({
    actorUserId,
    laboratorySlug,
  });
  const space = await getSpace.execute({
    actorUserId,
    laboratoryId: laboratory.id,
    slug: spaceSlug,
  });
  return {
    actorUserId,
    laboratoryId: laboratory.id,
    spaceId: space.id,
    path: `/app/labs/${laboratorySlug}/spaces/${spaceSlug}`,
  };
}
