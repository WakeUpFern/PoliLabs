# documents

Documents I implementa metadatos de documentos en PostgreSQL y binarios fuera de la base (SRS §18, RNF7) mediante el puerto `ObjectStorage`, con un único adaptador de disco local. Asociaciones: manuales por Resource y evidencia añadida a entradas de mantenimiento sin modificarlas.

Ver [arquitectura](../../../docs/architecture/documents.md), [validación](../../../docs/architecture/documents-validation.md) y [ADR 0016 — Aceptada](../../../docs/decisions/0016-documents-object-storage.md). La descarga sólo ocurre por la ruta autorizada; el borrado es lógico. S3 y evidencia de incidencias son pendientes explícitos.
