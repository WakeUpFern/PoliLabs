"use client";
import { useEffect, useId, useRef, useState } from "react";
import { Camera, ImagePlus, X } from "lucide-react";
import { formatBytes } from "./format-bytes";
// On phones (coarse pointer) the camera button opens the rear camera and the
// other one the gallery; on computers there is a single file chooser.
export function FilePicker({
  accept,
  file,
  onChange,
}: {
  accept: string;
  file: File | null;
  onChange: (file: File | null) => void;
}) {
  const id = useId();
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState<{ file: File; url: string } | null>(
    null,
  );
  // Shown only while the parent still holds the same file.
  const preview = selected && selected.file === file ? selected.url : null;
  useEffect(() => {
    // A parent reset (after a successful upload) clears the native inputs too.
    if (file) return;
    if (cameraRef.current) cameraRef.current.value = "";
    if (galleryRef.current) galleryRef.current.value = "";
  }, [file]);
  const select = (next: File | null) => {
    if (selected) URL.revokeObjectURL(selected.url);
    setSelected(
      next?.type.startsWith("image/")
        ? { file: next, url: URL.createObjectURL(next) }
        : null,
    );
    onChange(next);
  };
  const pick = (event: React.ChangeEvent<HTMLInputElement>) =>
    select(event.target.files?.[0] ?? null);
  const button =
    "btn btn-outline cursor-pointer gap-2 has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-guinda/55";
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <label
          htmlFor={`${id}-camera`}
          className={`${button} hidden pointer-coarse:inline-flex`}
        >
          <Camera aria-hidden className="size-4" />
          Tomar foto
          <input
            ref={cameraRef}
            id={`${id}-camera`}
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            onChange={pick}
          />
        </label>
        <label htmlFor={`${id}-gallery`} className={button}>
          <ImagePlus aria-hidden className="size-4" />
          <span className="pointer-coarse:hidden">Elegir archivo</span>
          <span className="hidden pointer-coarse:inline">
            Elegir de la galería
          </span>
          <input
            ref={galleryRef}
            id={`${id}-gallery`}
            type="file"
            accept={accept}
            className="sr-only"
            onChange={pick}
          />
        </label>
      </div>
      {file ? (
        <div className="flex items-center gap-3 rounded-md border border-line p-2">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element -- local object URL
            <img
              src={preview}
              alt=""
              className="size-16 shrink-0 rounded object-cover"
            />
          ) : null}
          <p className="min-w-0 flex-1 text-sm break-words">
            {file.name}
            <span className="block text-muted">{formatBytes(file.size)}</span>
          </p>
          <button
            type="button"
            className="icon-btn"
            aria-label="Quitar archivo"
            onClick={() => select(null)}
          >
            <X aria-hidden className="size-4" />
          </button>
        </div>
      ) : null}
    </div>
  );
}
