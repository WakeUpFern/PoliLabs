import { notFound } from "next/navigation";
import { UsageError } from "@/modules/usage/domain/usage";
import { AuthorizationDeniedError } from "@/modules/identity/domain/access-errors";
export async function usagePageData<T>(load: () => Promise<T>) {
  try {
    return await load();
  } catch (error) {
    if (
      error instanceof AuthorizationDeniedError ||
      (error instanceof UsageError &&
        ["not-found", "input", "relation"].includes(error.code))
    )
      notFound();
    throw error;
  }
}
