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
      <summary className="cursor-pointer font-semibold text-[#7a1731]">
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
              className="mt-1 block w-full rounded-xl border border-stone-300 p-2"
            />
          </label>
          <p className="text-stone-600">
            El archivo se oculta pero no se borra; el motivo queda registrado.
          </p>
          <button
            type="submit"
            className="rounded-xl border border-stone-300 px-3 py-1 font-semibold"
          >
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
