import type { GetLaboratoryBySlug } from "@/modules/identity/application/get-laboratory-by-slug";
import {
  AuthenticationRequiredError,
  AuthorizationDeniedError,
  InactiveUserError,
} from "@/modules/identity/domain/access-errors";
import type { DocumentService } from "../application/documents";
import {
  contentDisposition,
  documentTarget,
  DocumentError,
  MAX_DOCUMENT_BYTES,
} from "../domain/documents";
// Room for the multipart boundary, headers and text fields.
export const MAX_UPLOAD_BODY = MAX_DOCUMENT_BYTES + 64 * 1024;
export class UploadRejectedError extends Error {
  constructor(public readonly code: "origin" | "too-large" | "format") {
    super(`Upload rejected: ${code}`);
    this.name = "UploadRejectedError";
  }
}
// Only same-origin browser requests may upload; a missing Origin is rejected.
export function assertSameOrigin(headers: Headers, appOrigin: string) {
  if (headers.get("origin") !== appOrigin)
    throw new UploadRejectedError("origin");
}
// Reads at most `limit` bytes and cancels the stream as soon as it exceeds it.
export async function readLimitedBody(
  headers: Headers,
  body: ReadableStream<Uint8Array> | null,
  limit = MAX_UPLOAD_BODY,
) {
  const declared = headers.get("content-length");
  if (declared !== null) {
    const length = Number(declared);
    if (!Number.isSafeInteger(length) || length < 0)
      throw new UploadRejectedError("format");
    if (length > limit) throw new UploadRejectedError("too-large");
  }
  if (!body) throw new UploadRejectedError("format");
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel().catch(() => undefined);
      throw new UploadRejectedError("too-large");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(new ArrayBuffer(total));
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}
export type UploadResult = { status: number; message: string };
const documentMessages: Record<DocumentError["code"], UploadResult> = {
  input: {
    status: 422,
    message:
      "Revisa el archivo, el título (máximo 200 caracteres) o el motivo (máximo 1000).",
  },
  "not-found": {
    status: 404,
    message:
      "El destino no existe, no está activo o no está disponible para tu cuenta.",
  },
  type: {
    status: 415,
    message:
      "Formato no admitido. Sólo se aceptan PDF, PNG, JPEG y WebP verificados por su contenido.",
  },
  "too-large": {
    status: 413,
    message: "El archivo supera el máximo de 10 MB.",
  },
  limit: {
    status: 409,
    message: "La entrada ya tiene el máximo de 10 evidencias activas.",
  },
  archived: { status: 409, message: "El documento ya estaba archivado." },
  unavailable: {
    status: 503,
    message: "El archivo no está disponible en este momento.",
  },
};
export function documentResult(error: unknown): UploadResult {
  if (
    error instanceof AuthenticationRequiredError ||
    error instanceof InactiveUserError
  )
    return { status: 401, message: "Inicia sesión de nuevo." };
  if (error instanceof AuthorizationDeniedError)
    return {
      status: 403,
      message: "No tienes permiso para realizar esta operación.",
    };
  if (error instanceof UploadRejectedError)
    return {
      origin: { status: 403, message: "Origen de la solicitud no permitido." },
      "too-large": documentMessages["too-large"],
      format: { status: 400, message: "Solicitud de subida inválida." },
    }[error.code];
  if (error instanceof DocumentError) return documentMessages[error.code];
  throw error;
}
export type DocumentActionState = {
  status: "idle" | "success" | "error";
  message: string;
};
export function documentActionError(error: unknown): DocumentActionState {
  return { status: "error", message: documentResult(error).message };
}
export class DocumentsWeb {
  constructor(
    private readonly services: {
      currentActor: () => Promise<{ actorUserId: string }>;
      laboratory: Pick<GetLaboratoryBySlug, "execute">;
      documents: DocumentService;
    },
  ) {}
  async context(slug: string) {
    const { actorUserId } = await this.services.currentActor();
    const lab = await this.services.laboratory.execute({
      actorUserId,
      laboratorySlug: slug,
    });
    return { actorUserId, laboratoryId: lab.id };
  }
  async access(slug: string) {
    return this.services.documents.access(await this.context(slug));
  }
  async resourcePage(slug: string, resourceId: string) {
    const context = await this.context(slug);
    const [access, data] = await Promise.all([
      this.services.documents.access(context),
      this.services.documents.resourceDocuments({ ...context, resourceId }),
    ]);
    return { access, ...data };
  }
  async evidence(slug: string, resourceId: string) {
    const context = await this.context(slug);
    const [access, evidence] = await Promise.all([
      this.services.documents.access(context),
      this.services.documents.maintenanceEvidence({ ...context, resourceId }),
    ]);
    return { access, evidence };
  }
  // Called by the upload route after the origin and body size checks.
  async upload(slug: string, headers: Headers, bytes: Uint8Array<ArrayBuffer>) {
    const type = headers.get("content-type") ?? "";
    if (!type.toLowerCase().startsWith("multipart/form-data"))
      throw new UploadRejectedError("format");
    let form: FormData;
    try {
      form = await new Response(bytes, {
        headers: { "content-type": type },
      }).formData();
    } catch {
      throw new UploadRejectedError("format");
    }
    const file = form.get("file");
    if (!(file instanceof Blob)) throw new DocumentError("input");
    if (file.size > MAX_DOCUMENT_BYTES) throw new DocumentError("too-large");
    const context = await this.context(slug);
    return this.services.documents.upload({
      ...context,
      source: "WEB",
      target: documentTarget(
        String(form.get("targetKind") ?? ""),
        String(form.get("targetId") ?? ""),
      ),
      title: String(form.get("title") ?? "") || null,
      fileName: file instanceof File ? file.name : "",
      bytes: new Uint8Array(await file.arrayBuffer()),
    });
  }
  async download(slug: string, documentId: string) {
    const context = await this.context(slug);
    const { document, body } = await this.services.documents.download({
      ...context,
      documentId,
    });
    return new Response(body, {
      headers: {
        "Content-Type": document.mediaType,
        "Content-Length": String(document.byteSize),
        "Content-Disposition": contentDisposition(document.originalName),
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
        // Chromium refuses to render PDFs in sandboxed documents, so the
        // sandbox applies to images; PDFs rely on the verified type and nosniff.
        ...(document.mediaType === "application/pdf"
          ? {}
          : {
              "Content-Security-Policy":
                "sandbox; default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
            }),
        "Cross-Origin-Resource-Policy": "same-origin",
        "Referrer-Policy": "no-referrer",
      },
    });
  }
  async archive(slug: string, documentId: string, form: FormData) {
    const context = await this.context(slug);
    return this.services.documents.archive({
      ...context,
      documentId,
      reason: String(form.get("reason") ?? ""),
    });
  }
}
