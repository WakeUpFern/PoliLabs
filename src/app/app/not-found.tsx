import Link from "next/link";

export default function AppNotFound() {
  return (
    <section className="box p-8 sm:p-10">
      <p className="text-sm font-semibold text-guinda">No disponible</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">
        No encontramos ese laboratorio
      </h1>
      <p className="mt-3 max-w-xl leading-7 text-muted">
        El laboratorio no existe o tu cuenta no tiene autorización para
        consultarlo.
      </p>
      <Link href="/app" className="btn btn-primary mt-7">
        Volver a mis laboratorios
      </Link>
    </section>
  );
}
