import Link from "next/link";
import { academicWeb } from "@/modules/academic/web/services";
import { PRACTICE_LABELS } from "@/modules/academic/web/academic-web";
import { academicPageData } from "./page-data";
export default async function AcademicPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const data = await academicPageData(() => academicWeb.list(slug));
  return (
    <div>
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-guinda">
            Académico
          </p>
          <h1 className="mt-2 text-3xl font-semibold">Prácticas y sesiones</h1>
          <p className="mt-3 text-muted">
            Consulta las instrucciones y las sesiones en las que participas.
          </p>
        </div>
        {data.canManage ? (
          <Link
            href={`/app/labs/${slug}/academic/practices/new`}
            className="btn btn-primary"
          >
            Crear práctica
          </Link>
        ) : null}
      </header>
      <div className="mt-8 grid gap-4">
        {data.practices.map((p) => (
          <Link
            key={p.id}
            href={`/app/labs/${slug}/academic/practices/${p.id}`}
            className="box p-6 transition hover:border-guinda"
          >
            <span className="text-xs font-bold uppercase text-guinda">
              {PRACTICE_LABELS[p.status]}
            </span>
            <h2 className="mt-2 text-xl font-semibold">{p.title}</h2>
          </Link>
        ))}
        {data.practices.length === 0 ? (
          <p className="rounded-md border border-dashed border-line p-8 text-muted">
            Aún no hay prácticas disponibles.
          </p>
        ) : null}
      </div>
    </div>
  );
}
