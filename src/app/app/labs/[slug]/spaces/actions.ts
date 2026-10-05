"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCurrentActor } from "@/app/_lib/current-actor";
import { getLaboratoryBySlug } from "@/modules/identity/infrastructure/services";
import {
  createSpace,
  deactivateSpace,
  updateSpace,
} from "@/modules/spatial/infrastructure/services";
import {
  DuplicateSpaceSlugError,
  SpaceInputError,
  SpaceHasInventoryStockError,
  SpaceNotFoundError,
} from "@/modules/spatial/domain/space";
import { AuthorizationDeniedError } from "@/modules/identity/domain/access-errors";
import {
  initialSpaceActionState,
  type SpaceActionState,
} from "./space-form-state";

function readCapacity(formData: FormData): number | null {
  const value = String(formData.get("capacity") ?? "").trim();
  return value ? Number(value) : null;
}

function actionError(error: unknown): SpaceActionState {
  if (error instanceof SpaceHasInventoryStockError)
    return {
      message:
        "El espacio tiene existencias de inventario. Resuelve su ubicación o saldo antes de desactivarlo.",
    };
  if (error instanceof DuplicateSpaceSlugError)
    return { message: "Ya existe un espacio con ese slug en el laboratorio." };
  if (error instanceof SpaceInputError)
    return {
      message:
        "Revisa el nombre, el slug y la capacidad. La capacidad debe ser un entero positivo.",
    };
  if (
    error instanceof AuthorizationDeniedError ||
    error instanceof SpaceNotFoundError
  )
    return {
      message: "El espacio no existe o ya no tienes acceso para modificarlo.",
    };
  throw error;
}

async function resolveLaboratory(actorUserId: string, laboratorySlug: string) {
  return getLaboratoryBySlug.execute({ actorUserId, laboratorySlug });
}

export async function createSpaceAction(
  laboratorySlug: string,
  _previousState: SpaceActionState,
  formData: FormData,
): Promise<SpaceActionState> {
  let succeeded = false;
  try {
    const { actorUserId } = await requireCurrentActor();
    const laboratory = await resolveLaboratory(actorUserId, laboratorySlug);
    await createSpace.execute({
      actorUserId,
      laboratoryId: laboratory.id,
      name: String(formData.get("name") ?? ""),
      slug: String(formData.get("slug") ?? ""),
      capacity: readCapacity(formData),
    });
    succeeded = true;
  } catch (error) {
    return actionError(error);
  }

  if (succeeded) {
    revalidatePath(`/app/labs/${laboratorySlug}/spaces`);
    redirect(`/app/labs/${laboratorySlug}/spaces`);
  }
  return initialSpaceActionState;
}

export async function updateSpaceAction(
  laboratorySlug: string,
  currentSlug: string,
  _previousState: SpaceActionState,
  formData: FormData,
): Promise<SpaceActionState> {
  let updatedSlug = currentSlug;
  try {
    const { actorUserId } = await requireCurrentActor();
    const laboratory = await resolveLaboratory(actorUserId, laboratorySlug);
    const space = await updateSpace.execute({
      actorUserId,
      laboratoryId: laboratory.id,
      currentSlug,
      name: String(formData.get("name") ?? ""),
      slug: String(formData.get("slug") ?? ""),
      capacity: readCapacity(formData),
    });
    updatedSlug = space.slug;
  } catch (error) {
    return actionError(error);
  }

  revalidatePath(`/app/labs/${laboratorySlug}/spaces`);
  redirect(`/app/labs/${laboratorySlug}/spaces/${updatedSlug}/edit`);
}

export async function deactivateSpaceAction(
  laboratorySlug: string,
  spaceSlug: string,
  _previousState: SpaceActionState,
  _formData: FormData,
): Promise<SpaceActionState> {
  void _previousState;
  void _formData;
  try {
    const { actorUserId } = await requireCurrentActor();
    const laboratory = await resolveLaboratory(actorUserId, laboratorySlug);
    await deactivateSpace.execute({
      actorUserId,
      laboratoryId: laboratory.id,
      slug: spaceSlug,
    });
  } catch (error) {
    return actionError(error);
  }

  revalidatePath(`/app/labs/${laboratorySlug}/spaces`);
  redirect(`/app/labs/${laboratorySlug}/spaces`);
}
