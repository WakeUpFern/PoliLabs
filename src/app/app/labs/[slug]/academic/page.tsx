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
      <Link
        href={`/app/labs/${slug}`}
        className="text-sm font-semibold text-stone-600"
      >
        ← {data.laboratory.name}
      </Link>
      <header className="mt-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-[#7a1731]">
            Académico
          </p>
          <h1 className="mt-2 text-3xl font-semibold">Prácticas y sesiones</h1>
          <p className="mt-3 text-stone-600">
            Consulta las instrucciones y las sesiones en las que participas.
          </p>
        </div>
        {data.canManage ? (
          <Link
            href={`/app/labs/${slug}/academic/practices/new`}
            className="rounded-xl bg-[#7a1731] px-5 py-3 font-semibold text-white"
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
            className="rounded-2xl border border-stone-200 bg-white p-6 transition hover:border-[#7a1731]"
          >
            <span className="text-xs font-bold uppercase text-[#7a1731]">
              {PRACTICE_LABELS[p.status]}
            </span>
            <h2 className="mt-2 text-xl font-semibold">{p.title}</h2>
          </Link>
        ))}
        {data.practices.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-stone-300 p-8 text-stone-600">
            Aún no hay prácticas disponibles.
          </p>
        ) : null}
      </div>
    </div>
  );
}
