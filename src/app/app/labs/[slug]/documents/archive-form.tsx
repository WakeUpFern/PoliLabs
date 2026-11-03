"use client";
import { useActionState } from "react";
import { archiveDocumentAction } from "./actions";
import type { DocumentActionState } from "@/modules/documents/web/documents-web";
export function ArchiveForm({
  slug,
  documentId,
}: {
  slug: string;
  documentId: string;
}) {
  const [state, action, pending] = useActionState<
    DocumentActionState,
    FormData
  >(archiveDocumentAction.bind(null, slug, documentId), {
    status: "idle",
    message: "",
  });
  return (
    <details className="mt-2 text-sm">
      <summary className="cursor-pointer font-semibold text-guinda">
        Archivar
      </summary>
      <form action={action} className="mt-2 space-y-2">
        <fieldset disabled={pending} className="space-y-2">
          <label className="block">
            Motivo
            <textarea
              name="reason"
              required
              maxLength={1000}
              rows={2}
              className="mt-1 block w-full rounded-md border border-line p-2"
            />
          </label>
          <p className="text-muted">
            El archivo se oculta pero no se borra; el motivo queda registrado.
          </p>
          <button type="submit" className="btn">
            Confirmar archivado
          </button>
        </fieldset>
        {state.message ? (
          <p role={state.status === "error" ? "alert" : "status"}>
            {state.message}
          </p>
        ) : null}
      </form>
    </details>
  );
}
