// Runs in the browser before an upload. Phone photos are often 3–8 MB, above
// the 4 MB limit; re-encoding to a 1600 px JPEG keeps them around 300–600 KB
// and drops EXIF metadata (GPS location, device, date) on the way.
const MAX_SIDE = 1600;
const QUALITY = 0.82;
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
export async function preparePhoto(file: File): Promise<File> {
  // PDFs and other documents go as they are; the server verifies the format.
  if (file.type && !file.type.startsWith("image/")) return file;
  try {
    const bitmap = await createImageBitmap(file, {
      imageOrientation: "from-image",
    });
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return file;
    // JPEG has no transparency: transparent PNG areas become white.
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", QUALITY),
    );
    if (!blob) return file;
    const base = file.name.replace(/\.[^.]*$/, "") || "foto";
    return new File([blob], `${base}.jpg`, { type: "image/jpeg" });
  } catch {
    // Formats the browser cannot decode (e.g. HEIC on Chrome) go unchanged;
    // the server answers with the accepted formats.
    return file;
  }
}
export type UploadOutcome = { ok: boolean; message: string };
// Every check is repeated by the upload route handler.
export async function uploadDocument(
  slug: string,
  fields: {
    targetKind: "resource" | "maintenance-log" | "inventory-item";
    targetId: string;
    file: File;
    title?: string;
    note?: string;
  },
): Promise<UploadOutcome> {
  const file = await preparePhoto(fields.file);
  if (file.size > MAX_UPLOAD_BYTES)
    return { ok: false, message: "El archivo supera el máximo de 4 MB." };
  const form = new FormData();
  form.set("targetKind", fields.targetKind);
  form.set("targetId", fields.targetId);
  if (fields.title) form.set("title", fields.title);
  if (fields.note) form.set("note", fields.note);
  form.set("file", file);
  try {
    const response = await fetch(`/app/labs/${slug}/documents`, {
      method: "POST",
      body: form,
    });
    const result = response.headers
      .get("content-type")
      ?.includes("application/json")
      ? ((await response.json()) as { message: string })
      : { message: "Inicia sesión de nuevo." };
    return { ok: response.ok, message: result.message };
  } catch {
    return {
      ok: false,
      message: "No se pudo enviar el archivo. Intenta de nuevo.",
    };
  }
}
