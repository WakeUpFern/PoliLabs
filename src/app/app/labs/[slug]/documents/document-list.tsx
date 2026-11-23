import { formatTime } from "@/shared/time";
import type { DocumentSummary } from "@/modules/documents/domain/documents";
import { ArchiveForm } from "./archive-form";
import { formatBytes } from "./format-bytes";
const typeLabels: Record<DocumentSummary["mediaType"], string> = {
  "application/pdf": "PDF",
  "image/png": "PNG",
  "image/jpeg": "JPEG",
  "image/webp": "WebP",
};
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
      {documents.map((d) => {
        const href = `/app/labs/${slug}/documents/${d.id}`;
        const image = d.mediaType !== "application/pdf";
        return (
          <li
            key={d.id}
            className="flex gap-3 rounded-md border border-line p-3"
          >
            {image ? (
              <a
                href={href}
                target="_blank"
                rel="noopener"
                className="shrink-0"
                tabIndex={-1}
                aria-hidden
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- authorized route, not a static asset */}
                <img
                  src={href}
                  alt=""
                  loading="lazy"
                  className="size-20 rounded-md border border-line object-cover"
                />
              </a>
            ) : null}
            <div className="min-w-0 flex-1">
              <a
                className="font-semibold break-words text-guinda"
                href={href}
                target="_blank"
                rel="noopener"
              >
                {d.title ?? d.originalName}
              </a>
              {d.note ? (
                <p className="mt-1 break-words whitespace-pre-line">{d.note}</p>
              ) : null}
              <p className="text-sm break-words text-muted">
                {d.title ? `${d.originalName} · ` : ""}
                {typeLabels[d.mediaType]} · {formatBytes(d.byteSize)} ·{" "}
                {d.uploaderName} · {formatTime(d.createdAt)}
              </p>
              {canArchive ? (
                <ArchiveForm slug={slug} documentId={d.id} />
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
