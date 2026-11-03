"use client";
export default function AcademicErrorPage({ reset }: { reset: () => void }) {
  return (
    <section className="rounded-md border border-line bg-surface p-8">
      <h2 className="text-xl font-semibold">
        No se pudo cargar el módulo académico
      </h2>
      <p className="mt-3 text-muted">
        Vuelve a intentarlo. Si el problema persiste, consulta al responsable.
      </p>
      <button onClick={reset} className="btn btn-primary mt-5">
        Reintentar
      </button>
    </section>
  );
}
