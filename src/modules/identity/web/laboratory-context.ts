import type { GetLaboratoryBySlug } from "../application/get-laboratory-by-slug";

// Every laboratory page resolves the signed-in actor and the laboratory in its URL.
export async function laboratoryContext(
  services: {
    currentActor: () => Promise<{ actorUserId: string }>;
    laboratory: Pick<GetLaboratoryBySlug, "execute">;
  },
  slug: string,
) {
  const { actorUserId } = await services.currentActor();
  const laboratory = await services.laboratory.execute({
    actorUserId,
    laboratorySlug: slug,
  });
  return { laboratory, actor: { actorUserId, laboratoryId: laboratory.id } };
}
