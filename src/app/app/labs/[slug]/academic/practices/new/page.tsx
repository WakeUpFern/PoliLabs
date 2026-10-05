import Link from "next/link";
import { academicWeb } from "@/modules/academic/web/services";
import { academicPageData } from "../../page-data";
import { AcademicForm, field } from "../../academic-form";
export default async function NewPracticePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  await academicPageData(() => academicWeb.newPractice(slug));
  return (
    <div className="max-w-3xl">
      <Link
        href={`/app/labs/${slug}/academic`}
        className="text-sm font-semibold text-stone-600"
      >
        ← Prácticas
      </Link>
      <h1 className="mt-6 text-3xl font-semibold">Crear práctica</h1>
      <p className="mt-3 text-stone-600">
        Se guardará como borrador. Publícala cuando las instrucciones estén
        listas.
      </p>
      <section className="mt-6 rounded-2xl border border-stone-200 bg-white p-6">
        <AcademicForm
          slug={slug}
          operation="create-practice"
          label="Guardar borrador"
        >
          <label className="block font-medium">
            Título
            <input name="title" required maxLength={200} className={field} />
          </label>
          <label className="block font-medium">
            Instrucciones
            <textarea
              name="instructions"
              required
              maxLength={20000}
              rows={8}
              className={field}
            />
          </label>
        </AcademicForm>
      </section>
    </div>
  );
}
