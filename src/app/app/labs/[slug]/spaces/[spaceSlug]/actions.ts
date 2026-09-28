"use server";

import { revalidatePath } from "next/cache";
import { requireCurrentActor } from "@/app/_lib/current-actor";
import { getLaboratoryBySlug } from "@/modules/identity/infrastructure/services";
import { AuthorizationDeniedError } from "@/modules/identity/domain/access-errors";
import {
  InvalidLocationParentError,
  LocationCycleError,
  LocationHasActiveDependentsError,
  LocationInputError,
  LocationNotFoundError,
} from "@/modules/spatial/domain/location";
import {
  InvalidResourceLocationError,
  ResourceInputError,
  ResourceNotFoundError,
} from "@/modules/spatial/domain/resource";
import { SpaceNotFoundError } from "@/modules/spatial/domain/space";
import {
  createLocation,
  createResource,
  deactivateLocation,
  deactivateResource,
  getSpace,
  updateLocation,
  updateResource,
} from "@/modules/spatial/infrastructure/services";
import type { OrganizationActionState } from "./organization-form-state";

type Context = {
  actorUserId: string;
  laboratoryId: string;
  spaceId: string;
  path: string;
};

async function resolveContext(
  laboratorySlug: string,
  spaceSlug: string,
): Promise<Context> {
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

function failure(error: unknown): OrganizationActionState {
  if (error instanceof LocationInputError)
    return {
      status: "error",
      message: "El nombre de la ubicación es obligatorio.",
    };
  if (error instanceof InvalidLocationParentError)
    return {
      status: "error",
      message:
        "La ubicación padre no pertenece a este espacio o ya no está activa.",
    };
  if (error instanceof LocationCycleError)
    return {
      status: "error",
      message: "Ese cambio formaría un ciclo en la jerarquía.",
    };
  if (error instanceof LocationHasActiveDependentsError)
    return {
      status: "error",
      message:
        "Mueve o desactiva primero las ubicaciones hijas y los recursos activos.",
    };
  if (error instanceof ResourceInputError)
    return {
      status: "error",
      message: "El nombre del recurso es obligatorio.",
    };
  if (error instanceof InvalidResourceLocationError)
    return {
      status: "error",
      message: "La ubicación no pertenece a este espacio o ya no está activa.",
    };
  if (
    error instanceof AuthorizationDeniedError ||
    error instanceof SpaceNotFoundError ||
    error instanceof LocationNotFoundError ||
    error instanceof ResourceNotFoundError
  )
    return {
      status: "error",
      message: "El registro no existe o ya no tienes permiso para modificarlo.",
    };
  throw error;
}

function value(formData: FormData, key: string) {
  return String(formData.get(key) ?? "");
}

export async function createLocationAction(
  laboratorySlug: string,
  spaceSlug: string,
  _state: OrganizationActionState,
  formData: FormData,
): Promise<OrganizationActionState> {
  try {
    const context = await resolveContext(laboratorySlug, spaceSlug);
    await createLocation.execute({
      ...context,
      name: value(formData, "name"),
      parentId: value(formData, "parentId"),
    });
    revalidatePath(context.path);
    return { status: "success", message: "Ubicación creada." };
  } catch (error) {
    return failure(error);
  }
}

export async function updateLocationAction(
  laboratorySlug: string,
  spaceSlug: string,
  locationId: string,
  _state: OrganizationActionState,
  formData: FormData,
): Promise<OrganizationActionState> {
  try {
    const context = await resolveContext(laboratorySlug, spaceSlug);
    await updateLocation.execute({
      ...context,
      locationId,
      name: value(formData, "name"),
      parentId: value(formData, "parentId"),
    });
    revalidatePath(context.path);
    return { status: "success", message: "Ubicación actualizada." };
  } catch (error) {
    return failure(error);
  }
}

export async function deactivateLocationAction(
  laboratorySlug: string,
  spaceSlug: string,
  locationId: string,
  _state: OrganizationActionState,
  _formData: FormData,
): Promise<OrganizationActionState> {
  void _state;
  void _formData;
  try {
    const context = await resolveContext(laboratorySlug, spaceSlug);
    await deactivateLocation.execute({ ...context, locationId });
    revalidatePath(context.path);
    return { status: "success", message: "Ubicación desactivada." };
  } catch (error) {
    return failure(error);
  }
}

export async function createResourceAction(
  laboratorySlug: string,
  spaceSlug: string,
  _state: OrganizationActionState,
  formData: FormData,
): Promise<OrganizationActionState> {
  try {
    const context = await resolveContext(laboratorySlug, spaceSlug);
    await createResource.execute({
      ...context,
      name: value(formData, "name"),
      locationId: value(formData, "locationId"),
    });
    revalidatePath(context.path);
    return { status: "success", message: "Recurso creado." };
  } catch (error) {
    return failure(error);
  }
}

export async function updateResourceAction(
  laboratorySlug: string,
  spaceSlug: string,
  resourceId: string,
  _state: OrganizationActionState,
  formData: FormData,
): Promise<OrganizationActionState> {
  try {
    const context = await resolveContext(laboratorySlug, spaceSlug);
    await updateResource.execute({
      ...context,
      resourceId,
      name: value(formData, "name"),
      locationId: value(formData, "locationId"),
    });
    revalidatePath(context.path);
    return { status: "success", message: "Recurso actualizado." };
  } catch (error) {
    return failure(error);
  }
}

export async function deactivateResourceAction(
  laboratorySlug: string,
  spaceSlug: string,
  resourceId: string,
  _state: OrganizationActionState,
  _formData: FormData,
): Promise<OrganizationActionState> {
  void _state;
  void _formData;
  try {
    const context = await resolveContext(laboratorySlug, spaceSlug);
    await deactivateResource.execute({ ...context, resourceId });
    revalidatePath(context.path);
    return { status: "success", message: "Recurso desactivado." };
  } catch (error) {
    return failure(error);
  }
}
