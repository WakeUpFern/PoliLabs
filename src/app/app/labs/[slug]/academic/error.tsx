"use client";
export default function AcademicErrorPage({ reset }: { reset: () => void }) {
  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-8">
      <h2 className="text-xl font-semibold">
        No se pudo cargar el módulo académico
      </h2>
      <p className="mt-3 text-stone-600">
        Vuelve a intentarlo. Si el problema persiste, consulta al responsable.
      </p>
      <button
        onClick={reset}
        className="mt-5 rounded-xl bg-[#7a1731] px-5 py-3 font-semibold text-white"
      >
        Reintentar
      </button>
    </section>
  );
}
