"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { FilePicker } from "./file-picker";
import { uploadDocument } from "./prepare-photo";
const field = "mt-2 block w-full rounded-md border border-line p-3";
const PHOTOS = "image/png,image/jpeg,image/webp";
const PHOTOS_AND_PDF = `application/pdf,${PHOTOS}`;
// Uploads go to the dedicated route handler; it repeats every check.
export function UploadForm({
  slug,
  targetKind,
  targetId,
  withTitle = false,
  withNote = false,
  photosOnly = false,
  label,
}: {
  slug: string;
  targetKind: "resource" | "maintenance-log" | "inventory-item";
  targetId: string;
  withTitle?: boolean;
  withNote?: boolean;
  photosOnly?: boolean;
  label: string;
}) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [state, setState] = useState<{
    status: "idle" | "success" | "error";
    message: string;
  }>({ status: "idle", message: "" });
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!file) {
          setState({ status: "error", message: "Elige un archivo." });
          return;
        }
        setPending(true);
        const result = await uploadDocument(slug, {
          targetKind,
          targetId,
          file,
          title: withTitle ? title : undefined,
          note: withNote ? note : undefined,
        });
        setPending(false);
        setState({
          status: result.ok ? "success" : "error",
          message: result.message,
        });
        if (result.ok) {
          setFile(null);
          setTitle("");
          setNote("");
          router.refresh();
        }
      }}
    >
      <fieldset disabled={pending} className="space-y-3">
        {withTitle ? (
          <label className="block">
            Título (opcional)
            <input
              name="title"
              maxLength={200}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={field}
            />
          </label>
        ) : null}
        <div role="group" aria-label={label}>
          <p className="mb-2">{label}</p>
          <FilePicker
            accept={photosOnly ? PHOTOS : PHOTOS_AND_PDF}
            file={file}
            onChange={setFile}
          />
        </div>
        {withNote ? (
          <label className="block">
            Nota (opcional)
            <textarea
              name="note"
              maxLength={1000}
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ej. A esta caja le falta una llave."
              className={field}
            />
          </label>
        ) : null}
        <p className="text-sm text-muted">
          {photosOnly ? "PNG, JPEG o WebP" : "PDF, PNG, JPEG o WebP"}; máximo 4
          MB. Las fotos se reducen antes de subirlas y pierden sus metadatos
          (ubicación GPS, dispositivo).
        </p>
        <button type="submit" className="btn btn-primary">
          {pending ? "Subiendo…" : "Subir"}
        </button>
      </fieldset>
      {state.message ? (
        <p
          role={state.status === "error" ? "alert" : "status"}
          className={
            state.status === "error" ? "text-red-700" : "text-emerald-700"
          }
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
