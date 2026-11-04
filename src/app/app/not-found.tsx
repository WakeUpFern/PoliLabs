import Link from "next/link";

export default function AppNotFound() {
  return (
    <section className="box p-6 sm:p-8">
      <h1 className="text-2xl font-semibold">No encontramos ese laboratorio</h1>
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
