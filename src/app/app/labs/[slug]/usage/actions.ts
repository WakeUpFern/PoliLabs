"use server";
import { revalidatePath } from "next/cache";
import { usageWeb } from "@/modules/usage/web/services";
import {
  usageActionError,
  type UsageActionState,
} from "@/modules/usage/web/usage-web";
export async function usageAction(
  slug: string,
  operation: "start" | "finish",
  _previous: UsageActionState,
  form: FormData,
): Promise<UsageActionState> {
  try {
    await usageWeb.submit(slug, operation, form);
  } catch (error) {
    return usageActionError(error);
  }
  revalidatePath(`/app/labs/${slug}`, "layout");
  return {
    status: "success",
    message: operation === "start" ? "Uso iniciado." : "Uso terminado.",
  };
}
