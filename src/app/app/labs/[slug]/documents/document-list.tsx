import { formatAcademicTime } from "@/modules/academic/web/time";
import type { DocumentSummary } from "@/modules/documents/domain/documents";
import { ArchiveForm } from "./archive-form";
const typeLabels: Record<DocumentSummary["mediaType"], string> = {
  "application/pdf": "PDF",
  "image/png": "PNG",
  "image/jpeg": "JPEG",
  "image/webp": "WebP",
};
export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
export function DocumentList({
  slug,
  documents,
  canArchive,
  empty,
}: {
  slug: string;
  documents: DocumentSummary[];
  canArchive: boolean;
  empty: string;
}) {
  if (!documents.length) return <p className="text-sm">{empty}</p>;
  return (
    <ul className="space-y-3">
      {documents.map((d) => (
        <li key={d.id} className="rounded-xl border border-stone-200 p-3">
          <a
            className="font-semibold break-words text-[#7a1731]"
            href={`/app/labs/${slug}/documents/${d.id}`}
            target="_blank"
            rel="noopener"
          >
            {d.title ?? d.originalName}
          </a>
          <p className="text-sm break-words text-stone-600">
            {d.title ? `${d.originalName} · ` : ""}
            {typeLabels[d.mediaType]} · {formatBytes(d.byteSize)} ·{" "}
            {d.uploaderName} · {formatAcademicTime(d.createdAt)}
          </p>
          {canArchive ? <ArchiveForm slug={slug} documentId={d.id} /> : null}
        </li>
      ))}
    </ul>
  );
}
