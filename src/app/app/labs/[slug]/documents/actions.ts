"use server";
import { revalidatePath } from "next/cache";
import { documentsWeb } from "@/modules/documents/web/services";
import {
  documentActionError,
  type DocumentActionState,
} from "@/modules/documents/web/documents-web";
export async function archiveDocumentAction(
  slug: string,
  documentId: string,
  _previous: DocumentActionState,
  form: FormData,
): Promise<DocumentActionState> {
  try {
    await documentsWeb.archive(slug, documentId, form);
    revalidatePath(`/app/labs/${slug}`, "layout");
    return { status: "success", message: "Documento archivado." };
  } catch (error) {
    return documentActionError(error);
  }
}
