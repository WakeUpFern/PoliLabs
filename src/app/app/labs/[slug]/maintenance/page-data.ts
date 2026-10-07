import { notFound } from "next/navigation";
import { MaintenanceError } from "@/modules/maintenance/domain/maintenance";
import { AuthorizationDeniedError } from "@/modules/identity/domain/access-errors";
export async function maintenancePageData<T>(load: () => Promise<T>) {
  try {
    return await load();
  } catch (error) {
    if (
      error instanceof AuthorizationDeniedError ||
      (error instanceof MaintenanceError &&
        ["input", "not-found"].includes(error.code))
    )
      notFound();
    throw error;
  }
}
