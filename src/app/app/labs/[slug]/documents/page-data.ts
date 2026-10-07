import { notFound } from "next/navigation";
import { DocumentError } from "@/modules/documents/domain/documents";
import { AuthorizationDeniedError } from "@/modules/identity/domain/access-errors";
export async function documentPageData<T>(load: () => Promise<T>) {
  try {
    return await load();
  } catch (error) {
    if (
      error instanceof AuthorizationDeniedError ||
      (error instanceof DocumentError &&
        ["input", "not-found"].includes(error.code))
    )
      notFound();
    throw error;
  }
}
