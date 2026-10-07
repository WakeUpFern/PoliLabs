export type DocumentContext = { actorUserId: string; laboratoryId: string };
export type DocumentSource = "WEB" | "API" | "AGENT" | "SYSTEM";
export const DOCUMENT_MEDIA_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;
export type DocumentMediaType = (typeof DOCUMENT_MEDIA_TYPES)[number];
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
export const MAX_EVIDENCE_PER_LOG = 10;
export const MAX_DOCUMENT_NAME = 255;
export const MAX_DOCUMENT_TITLE = 200;
export const MAX_ARCHIVE_REASON = 1000;
export type DocumentTarget =
  | { kind: "resource"; resourceId: string }
  | { kind: "maintenance-log"; maintenanceLogId: string };
export type DocumentKind = DocumentTarget["kind"];
export class DocumentError extends Error {
  constructor(
    public readonly code:
      | "input"
      | "not-found"
      | "type"
      | "too-large"
      | "limit"
      | "archived"
      | "unavailable",
  ) {
    super(`Document rejected: ${code}`);
    this.name = "DocumentError";
  }
}
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function documentId(value: string) {
  if (!uuidPattern.test(value)) throw new DocumentError("input");
  return value.toLowerCase();
}
export function documentSource(value: string): DocumentSource {
  if (!["WEB", "API", "AGENT", "SYSTEM"].includes(value))
    throw new DocumentError("input");
  return value as DocumentSource;
}
export function documentTarget(kind: string, id: string): DocumentTarget {
  if (kind === "resource") return { kind, resourceId: documentId(id) };
  if (kind === "maintenance-log")
    return { kind, maintenanceLogId: documentId(id) };
  throw new DocumentError("input");
}
function startsWith(bytes: Uint8Array, signature: number[], offset = 0) {
  return (
    bytes.length >= offset + signature.length &&
    signature.every((b, i) => bytes[offset + i] === b)
  );
}
const ascii = (text: string) => [...text].map((c) => c.charCodeAt(0));
// The declared extension and client Content-Type are ignored: only the
// leading bytes decide the stored media type.
export function sniffMediaType(bytes: Uint8Array): DocumentMediaType | null {
  if (startsWith(bytes, ascii("%PDF-"))) return "application/pdf";
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    return "image/png";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, ascii("RIFF")) && startsWith(bytes, ascii("WEBP"), 8))
    return "image/webp";
  return null;
}
export function documentBytes(bytes: Uint8Array) {
  if (bytes.byteLength === 0) throw new DocumentError("input");
  if (bytes.byteLength > MAX_DOCUMENT_BYTES)
    throw new DocumentError("too-large");
  const mediaType = sniffMediaType(bytes);
  if (!mediaType) throw new DocumentError("type");
  return mediaType;
}
// Display name only: storage keys never derive from it.
export function documentName(value: string) {
  const base = value.split(/[\\/]/).pop() ?? "";
  const clean = base.normalize("NFC").replace(/[\u0000-\u001f\u007f]/g, "");
  const result = clean.trim();
  if (!result || result === "." || result === "..")
    throw new DocumentError("input");
  return [...result].slice(0, MAX_DOCUMENT_NAME).join("");
}
export function documentText(
  value: string | null | undefined,
  maximum: number,
  required: boolean,
) {
  const result = (value ?? "").trim();
  if (!result) {
    if (required) throw new DocumentError("input");
    return null;
  }
  if (result.length > maximum) throw new DocumentError("input");
  return result;
}
export const STORAGE_KEY_PATTERN =
  /^documents\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
// Random object identity, unrelated to the document row id or file name.
export function storageKey(laboratoryId: string, objectId: string) {
  const key = `documents/${documentId(laboratoryId)}/${documentId(objectId)}`;
  if (!STORAGE_KEY_PATTERN.test(key)) throw new DocumentError("input");
  return key;
}
export function contentDisposition(name: string) {
  const fallback = name.replace(/[^\x20-\x7e]|["\\]/g, "_");
  const encoded = encodeURIComponent(name).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `inline; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
export type DocumentSummary = {
  id: string;
  kind: DocumentKind;
  title: string | null;
  originalName: string;
  mediaType: DocumentMediaType;
  byteSize: number;
  sha256: string;
  uploadedBy: string;
  uploaderName: string;
  source: DocumentSource;
  createdAt: Date;
  resourceId: string | null;
  maintenanceLogId: string | null;
};
export type DocumentRecord = DocumentSummary & {
  laboratoryId: string;
  storageKey: string;
  archivedAt: Date | null;
};
export type DocumentResource = {
  id: string;
  name: string;
  spaceId: string;
  spaceName: string;
  isActive: boolean;
};
export type NewDocument = {
  id: string;
  storageKey: string;
  target: DocumentTarget;
  title: string | null;
  originalName: string;
  mediaType: DocumentMediaType;
  byteSize: number;
  sha256: string;
  source: DocumentSource;
};
