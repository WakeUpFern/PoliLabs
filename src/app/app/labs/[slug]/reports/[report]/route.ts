import { AuthorizationDeniedError } from "@/modules/identity/domain/access-errors";
import { ReportError } from "@/modules/reports/domain/reports";
import { reportsWeb } from "@/modules/reports/web/services";
export const runtime = "nodejs";
// Exports are generated per request after revalidating session and permission.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string; report: string }> },
) {
  const { slug, report } = await params;
  const url = new URL(request.url);
  try {
    return await reportsWeb.download(slug, report, url.searchParams);
  } catch (error) {
    if (
      error instanceof ReportError &&
      (error.code === "input" || error.code === "too-large")
    ) {
      // Back to the form with the reason; nothing was exported.
      const back = new URL(`/app/labs/${slug}/reports`, url);
      back.searchParams.set("report", report);
      back.searchParams.set("error", error.code);
      return Response.redirect(back, 303);
    }
    // Denied, foreign and unknown reports are indistinguishable.
    if (
      error instanceof AuthorizationDeniedError ||
      error instanceof ReportError
    )
      return new Response("No encontrado.", {
        status: 404,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    throw error;
  }
}
