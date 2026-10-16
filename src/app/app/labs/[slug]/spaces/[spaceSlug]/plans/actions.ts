"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCurrentActor } from "@/app/_lib/current-actor";
import { AuthorizationDeniedError } from "@/modules/identity/domain/access-errors";
import { getLaboratoryBySlug } from "@/modules/identity/infrastructure/services";
import { FloorPlanError } from "@/modules/spatial/domain/floor-plan";
import { SpaceNotFoundError } from "@/modules/spatial/domain/space";
import {
  floorPlans,
  getSpace,
} from "@/modules/spatial/infrastructure/services";
import type { OrganizationActionState } from "../organization-form-state";

async function resolveContext(laboratorySlug: string, spaceSlug: string) {
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

const messages: Record<FloorPlanError["code"], string> = {
  input:
    "Revisa los datos: nombre obligatorio y medidas enteras entre 1 y 100 celdas; las coordenadas empiezan en 0.",
  bounds:
    "El elemento no cabe en el plano. Ajusta posición y tamaño, o amplía el plano antes de moverlo.",
  reference: "El recurso o la ubicación ya no está activo en este espacio.",
  duplicate: "Ese recurso o ubicación ya está colocado en este plano.",
  "not-found": "El plano o el elemento ya no existe.",
};

function failure(error: unknown): OrganizationActionState {
  if (error instanceof FloorPlanError)
    return { status: "error", message: messages[error.code] };
  if (
    error instanceof AuthorizationDeniedError ||
    error instanceof SpaceNotFoundError
  )
    return {
      status: "error",
      message: "El registro no existe o ya no tienes permiso para modificarlo.",
    };
  throw error;
}

const field = (form: FormData, key: string) => String(form.get(key) ?? "");
const box = (form: FormData) => ({
  x: field(form, "x"),
  y: field(form, "y"),
  width: field(form, "width"),
  height: field(form, "height"),
});

export async function createFloorPlanAction(
  laboratorySlug: string,
  spaceSlug: string,
  _state: OrganizationActionState,
  form: FormData,
): Promise<OrganizationActionState> {
  let planId: string;
  try {
    const context = await resolveContext(laboratorySlug, spaceSlug);
    const plan = await floorPlans.create({
      ...context,
      name: field(form, "name"),
      width: field(form, "width"),
      height: field(form, "height"),
    });
    revalidatePath(context.path);
    planId = plan.id;
  } catch (error) {
    return failure(error);
  }
  redirect(`/app/labs/${laboratorySlug}/spaces/${spaceSlug}/plans/${planId}`);
}

export async function updateFloorPlanAction(
  laboratorySlug: string,
  spaceSlug: string,
  floorPlanId: string,
  _state: OrganizationActionState,
  form: FormData,
): Promise<OrganizationActionState> {
  try {
    const context = await resolveContext(laboratorySlug, spaceSlug);
    await floorPlans.update({
      ...context,
      floorPlanId,
      name: field(form, "name"),
      width: field(form, "width"),
      height: field(form, "height"),
    });
    revalidatePath(`${context.path}/plans/${floorPlanId}`);
    return { status: "success", message: "Plano actualizado." };
  } catch (error) {
    return failure(error);
  }
}

export async function deactivateFloorPlanAction(
  laboratorySlug: string,
  spaceSlug: string,
  floorPlanId: string,
  _state: OrganizationActionState,
  _form: FormData,
): Promise<OrganizationActionState> {
  void _state;
  void _form;
  let path: string;
  try {
    const context = await resolveContext(laboratorySlug, spaceSlug);
    await floorPlans.deactivate({ ...context, floorPlanId });
    revalidatePath(context.path);
    path = context.path;
  } catch (error) {
    return failure(error);
  }
  redirect(path);
}

export async function addFloorPlanElementAction(
  laboratorySlug: string,
  spaceSlug: string,
  floorPlanId: string,
  _state: OrganizationActionState,
  form: FormData,
): Promise<OrganizationActionState> {
  try {
    const context = await resolveContext(laboratorySlug, spaceSlug);
    const kind = field(form, "kind");
    await floorPlans.addElement({
      ...context,
      floorPlanId,
      kind,
      targetId: field(form, kind === "location" ? "locationId" : "resourceId"),
      label: field(form, "label"),
      ...box(form),
    });
    revalidatePath(`${context.path}/plans/${floorPlanId}`);
    return { status: "success", message: "Elemento colocado." };
  } catch (error) {
    return failure(error);
  }
}

export async function moveFloorPlanElementAction(
  laboratorySlug: string,
  spaceSlug: string,
  floorPlanId: string,
  elementId: string,
  _state: OrganizationActionState,
  form: FormData,
): Promise<OrganizationActionState> {
  try {
    const context = await resolveContext(laboratorySlug, spaceSlug);
    await floorPlans.moveElement({
      ...context,
      floorPlanId,
      elementId,
      ...box(form),
    });
    revalidatePath(`${context.path}/plans/${floorPlanId}`);
    return { status: "success", message: "Elemento actualizado." };
  } catch (error) {
    return failure(error);
  }
}

export async function removeFloorPlanElementAction(
  laboratorySlug: string,
  spaceSlug: string,
  floorPlanId: string,
  elementId: string,
  _state: OrganizationActionState,
  _form: FormData,
): Promise<OrganizationActionState> {
  void _state;
  void _form;
  try {
    const context = await resolveContext(laboratorySlug, spaceSlug);
    await floorPlans.removeElement({ ...context, floorPlanId, elementId });
    revalidatePath(`${context.path}/plans/${floorPlanId}`);
    return { status: "success", message: "Elemento retirado." };
  } catch (error) {
    return failure(error);
  }
}
