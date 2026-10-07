import { notFound } from "next/navigation";
import { IncidentError } from "@/modules/incidents/domain/incidents";
import { AuthorizationDeniedError } from "@/modules/identity/domain/access-errors";
export async function incidentPageData<T>(load: () => Promise<T>) {
  try {
    return await load();
  } catch (error) {
    if (
      error instanceof AuthorizationDeniedError ||
      (error instanceof IncidentError &&
        ["input", "not-found", "relation"].includes(error.code))
    )
      notFound();
    throw error;
  }
}
