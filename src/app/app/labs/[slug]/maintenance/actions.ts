"use server";
import { revalidatePath } from "next/cache";
import { maintenanceWeb } from "@/modules/maintenance/web/services";
import {
  maintenanceActionError,
  type MaintenanceActionState,
} from "@/modules/maintenance/web/maintenance-web";
export async function maintenanceAction(
  slug: string,
  resourceId: string,
  _previous: MaintenanceActionState,
  form: FormData,
): Promise<MaintenanceActionState> {
  try {
    await maintenanceWeb.record(slug, resourceId, form);
    revalidatePath(`/app/labs/${slug}`, "layout");
    return { status: "success", message: "Entrada de mantenimiento guardada." };
  } catch (error) {
    return maintenanceActionError(error);
  }
}
