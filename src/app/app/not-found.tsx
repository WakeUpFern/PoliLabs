import Link from "next/link";

export default function AppNotFound() {
  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-8 sm:p-10">
      <p className="text-sm font-semibold text-guinda">No disponible</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">
        No encontramos ese laboratorio
      </h1>
      <p className="mt-3 max-w-xl leading-7 text-stone-600">
        El laboratorio no existe o tu cuenta no tiene autorización para
        consultarlo.
      </p>
      <Link
        href="/app"
        className="mt-7 inline-flex min-h-11 items-center rounded-xl bg-guinda px-5 text-sm font-semibold text-white transition hover:bg-guinda-deep"
      >
        Volver a mis laboratorios
      </Link>
    </section>
  );
}
