"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { academicWeb } from "@/modules/academic/web/services";
import {
  academicActionError,
  type AcademicActionState,
  type AcademicOperation,
} from "@/modules/academic/web/academic-web";
export async function academicAction(
  slug: string,
  operation: AcademicOperation,
  id: string | null,
  _state: AcademicActionState,
  form: FormData,
): Promise<AcademicActionState> {
  let result;
  try {
    result = await academicWeb.submit(slug, operation, id, form);
  } catch (error) {
    return academicActionError(error);
  }
  revalidatePath(`/app/labs/${slug}/academic`, "layout");
  if (operation === "create-practice")
    redirect(`/app/labs/${slug}/academic/practices/${result.practiceId}`);
  if (operation === "create-session")
    redirect(`/app/labs/${slug}/academic/sessions/${result.sessionId}`);
  return { status: "success", message: "Cambios guardados." };
}
