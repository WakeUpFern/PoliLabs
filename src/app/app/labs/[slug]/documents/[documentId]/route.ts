import { documentsWeb } from "@/modules/documents/web/services";
import { documentResult } from "@/modules/documents/web/documents-web";
export const runtime = "nodejs";
// The only way to read a stored object: authorization is revalidated per request.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string; documentId: string }> },
) {
  const { slug, documentId } = await params;
  try {
    return await documentsWeb.download(slug, documentId);
  } catch (error) {
    const result = documentResult(error);
    // Denied, foreign, archived and malformed ids are indistinguishable.
    const status = [403, 404, 422].includes(result.status)
      ? 404
      : result.status;
    return new Response(status === 404 ? "No encontrado." : result.message, {
      status,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
}
