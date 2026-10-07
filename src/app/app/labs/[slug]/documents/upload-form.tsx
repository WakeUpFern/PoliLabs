"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
const MAX_BYTES = 10 * 1024 * 1024;
const field = "mt-2 block w-full rounded-xl border border-stone-300 p-3";
// Uploads go to the dedicated route handler; it repeats every check.
export function UploadForm({
  slug,
  targetKind,
  targetId,
  withTitle,
  label,
}: {
  slug: string;
  targetKind: "resource" | "maintenance-log";
  targetId: string;
  withTitle: boolean;
  label: string;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, setPending] = useState(false);
  const [state, setState] = useState<{
    status: "idle" | "success" | "error";
    message: string;
  }>({ status: "idle", message: "" });
  return (
    <form
      ref={formRef}
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        const file = form.get("file");
        if (file instanceof File && file.size > MAX_BYTES) {
          setState({
            status: "error",
            message: "El archivo supera el máximo de 10 MB.",
          });
          return;
        }
        form.set("targetKind", targetKind);
        form.set("targetId", targetId);
        setPending(true);
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
          setState({
            status: response.ok ? "success" : "error",
            message: result.message,
          });
          if (response.ok) {
            formRef.current?.reset();
            router.refresh();
          }
        } catch {
          setState({
            status: "error",
            message: "No se pudo enviar el archivo. Intenta de nuevo.",
          });
        } finally {
          setPending(false);
        }
      }}
    >
      <fieldset disabled={pending} className="space-y-3">
        {withTitle ? (
          <label className="block">
            Título (opcional)
            <input name="title" maxLength={200} className={field} />
          </label>
        ) : null}
        <label className="block">
          {label}
          <input
            name="file"
            type="file"
            required
            accept="application/pdf,image/png,image/jpeg,image/webp"
            className={field}
          />
        </label>
        <p className="text-sm text-stone-600">
          PDF, PNG, JPEG o WebP; máximo 10 MB. El formato se verifica por el
          contenido del archivo. Las fotos conservan sus metadatos (p. ej.
          ubicación GPS).
        </p>
        <button
          type="submit"
          className="rounded-xl bg-[#7a1731] px-4 py-2 font-semibold text-white disabled:opacity-60"
        >
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
