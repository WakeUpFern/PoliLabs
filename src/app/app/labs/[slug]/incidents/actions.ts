"use server";
import { revalidatePath } from "next/cache";
import { incidentsWeb } from "@/modules/incidents/web/services";
import {
  incidentActionError,
  type IncidentActionState,
} from "@/modules/incidents/web/incidents-web";
export async function incidentAction(
  slug: string,
  operation: "report" | "transition",
  _previous: IncidentActionState,
  form: FormData,
): Promise<IncidentActionState> {
  try {
    const row = await incidentsWeb.submit(slug, operation, form);
    revalidatePath(`/app/labs/${slug}`, "layout");
    return {
      status: "success",
      message:
        operation === "report"
          ? "Incidencia reportada."
          : "Seguimiento actualizado.",
      incidentId: row.id,
    };
  } catch (error) {
    return incidentActionError(error);
  }
}
