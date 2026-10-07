import { revalidatePath } from "next/cache";
import { readAppOrigin } from "@/config/document-storage-env";
import { documentsWeb } from "@/modules/documents/web/services";
import {
  assertSameOrigin,
  documentResult,
  readLimitedBody,
} from "@/modules/documents/web/documents-web";
export const runtime = "nodejs";
// Dedicated upload endpoint: Server Actions keep their default body limit.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  try {
    assertSameOrigin(request.headers, readAppOrigin(process.env));
    const bytes = await readLimitedBody(request.headers, request.body);
    const document = await documentsWeb.upload(slug, request.headers, bytes);
    revalidatePath(`/app/labs/${slug}`, "layout");
    return Response.json(
      { status: "success", message: "Archivo guardado.", id: document.id },
      { status: 201 },
    );
  } catch (error) {
    const result = documentResult(error);
    return Response.json(
      { status: "error", message: result.message },
      { status: result.status },
    );
  }
}
