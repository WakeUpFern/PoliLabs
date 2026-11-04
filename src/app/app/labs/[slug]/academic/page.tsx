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
          <h1 className="text-2xl font-semibold">Prácticas y sesiones</h1>
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
      <div className="mt-6 grid gap-3">
        {data.practices.map((p) => (
          <Link
            key={p.id}
            href={`/app/labs/${slug}/academic/practices/${p.id}`}
            className="box flex flex-wrap items-center justify-between gap-3 p-5 transition hover:border-guinda"
          >
            <h2 className="text-lg font-semibold">{p.title}</h2>
            <span className="rounded-full bg-paper px-2.5 py-0.5 text-[0.8125rem] font-semibold text-muted">
              {PRACTICE_LABELS[p.status]}
            </span>
          </Link>
        ))}
        {data.practices.length === 0 ? (
          <p className="empty-state">Aún no hay prácticas disponibles.</p>
        ) : null}
      </div>
    </div>
  );
}
