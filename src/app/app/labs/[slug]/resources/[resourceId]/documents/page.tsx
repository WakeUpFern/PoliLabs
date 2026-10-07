import Link from "next/link";
import { documentsWeb } from "@/modules/documents/web/services";
import { documentPageData } from "../../../documents/page-data";
import { DocumentList } from "../../../documents/document-list";
import { UploadForm } from "../../../documents/upload-form";
export default async function ResourceDocumentsPage({
  params,
}: {
  params: Promise<{ slug: string; resourceId: string }>;
}) {
  const { slug, resourceId } = await params;
  const { access, resource, documents } = await documentPageData(() =>
    documentsWeb.resourcePage(slug, resourceId),
  );
  return (
    <div>
      <Link href={`/app/labs/${slug}`}>← Laboratorio</Link>
      <h1 className="mt-6 text-3xl font-semibold break-words">
        Documentos de {resource.name}
      </h1>
      <p className="mt-2 text-stone-600">{resource.spaceName}</p>
      {access.canReadEvidence ? (
        <Link
          className="mt-2 inline-block text-sm font-semibold text-[#7a1731]"
          href={`/app/labs/${slug}/maintenance/resources/${resource.id}`}
        >
          Ver mantenimiento y evidencias
        </Link>
      ) : null}
      {access.canUpload && resource.isActive ? (
        <section className="mt-6 rounded-2xl border border-stone-200 bg-white p-6">
          <h2 className="mb-4 text-xl font-semibold">
            Subir manual o documento
          </h2>
          <UploadForm
            slug={slug}
            targetKind="resource"
            targetId={resource.id}
            withTitle
            label="Archivo"
          />
        </section>
      ) : null}
      <section className="mt-6 rounded-2xl border border-stone-200 bg-white p-6">
        <h2 className="mb-4 text-xl font-semibold">Manuales y documentos</h2>
        <DocumentList
          slug={slug}
          documents={documents}
          canArchive={access.canArchive}
          empty="Este recurso no tiene documentos."
        />
      </section>
    </div>
  );
}
