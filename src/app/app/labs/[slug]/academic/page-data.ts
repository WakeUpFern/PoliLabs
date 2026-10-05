import { notFound } from "next/navigation";
import { AuthorizationDeniedError } from "@/modules/identity/domain/access-errors";
import { AcademicError } from "@/modules/academic/domain/academic";
export async function academicPageData<T>(load: () => Promise<T>): Promise<T> {
  try {
    return await load();
  } catch (error) {
    if (
      error instanceof AuthorizationDeniedError ||
      (error instanceof AcademicError &&
        (error.code === "not-found" || error.code === "input"))
    )
      notFound();
    throw error;
  }
}
