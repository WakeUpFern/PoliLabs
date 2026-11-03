import { AuthorizationDeniedError } from "@/modules/identity/domain/access-errors";

// A panel the person may no longer read shows its fallback; real failures still surface.
export async function unlessDenied<T>(load: () => Promise<T>, fallback: T) {
  try {
    return await load();
  } catch (error) {
    if (error instanceof AuthorizationDeniedError) return fallback;
    throw error;
  }
}
