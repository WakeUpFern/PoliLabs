# Documents I

## Alcance

Documents I fue seleccionado el 7 de octubre de 2026 tras Maintenance I; el responsable aprobó explícitamente su alcance y las decisiones del [ADR 0016](../decisions/0016-documents-object-storage.md) (Aceptada). SRS RF24, RNF7, RNF10, §§11, 18, 22.1, 30–31 y §33.13.

Incluye: puerto de almacenamiento con adaptador de disco local, metadatos en PostgreSQL, manuales por Resource, evidencia añadida a entradas de mantenimiento, subida por route handler, descarga autorizada, archivado lógico y barrido de huérfanos. No incluye S3, documentos de prácticas, evidencia de incidencias, versionado, purga física, eliminación de EXIF ni Giussepe.

## Módulo

`src/modules/documents/` (el README de `knowledge` queda reservado para la futura recuperación de conocimiento):

- `domain/documents.ts`: firma de bytes (`sniffMediaType`), límites, saneamiento del nombre, claves de objeto, `Content-Disposition` y errores. Sin dependencias de Node, React, HTTP ni Drizzle.
- `application/object-storage.ts`: puerto `ObjectStorage` y `findOrphans`.
- `application/document-store.ts` y `documents.ts`: `DocumentService` (`access`, `resourceDocuments`, `maintenanceEvidence`, `upload`, `download`, `archive`) sobre `DocumentStore.run`, que autoriza cada permiso requerido con `authorizeLocked` dentro de una transacción READ COMMITTED.
- `infrastructure/`: esquema Drizzle, `DrizzleDocumentStore`, `LocalDiskObjectStorage` y composición.
- `web/`: `DocumentsWeb` (límite de stream, `Origin`, parseo multipart, respuesta de descarga y mensajes).

## Modelo

`documents`: `id`, `laboratory_id`, `storage_key` único (`documents/<laboratory_id>/<uuid>`, CHECK de prefijo del mismo laboratorio), `title` (sólo manuales), `original_name`, `media_type` (PDF/PNG/JPEG/WebP), `byte_size` (1 B–10 MB), `sha256`, `uploaded_by`, `source`, `created_at` (`clock_timestamp()`), asociación exclusiva `resource_id`+`space_id` o `maintenance_log_id`, y archivado (`archived_at`, `archived_by`, `archive_reason`: los tres o ninguno).

FKs RESTRICT: laboratorio, usuarios, `(space_id, laboratory_id) → spaces`, `(resource_id, space_id) → resources`, `(maintenance_log_id, laboratory_id) → maintenance_logs`. Reutilizan índices únicos existentes; el único índice único nuevo (`storage_key`) se crea antes de las FKs.

Triggers: `documents_immutable` sólo permite pasar una vez de activo a archivado sin cambiar otras columnas; `documents_evidence_limit` bloquea la entrada de bitácora y rechaza la undécima evidencia activa. La bitácora no se actualiza nunca (su trigger de inmutabilidad sigue vigente).

## Permisos y visibilidad

| Operación                      | Permisos                                                  |
| ------------------------------ | --------------------------------------------------------- |
| Ver y descargar manuales       | `document.read`                                           |
| Subir manual a recurso activo  | `document.upload`                                         |
| Ver y descargar evidencia      | `maintenance.read`                                        |
| Añadir evidencia a una entrada | `maintenance.create` + `document.upload`                  |
| Archivar                       | `document.archive` (+ `maintenance.read` si es evidencia) |

Asignados por migración y bootstrap a `laboratory_responsible`. Los recursos desactivados conservan su biblioteca legible; subir exige recurso y espacio activos. Añadir evidencia no exige que el recurso siga activo: la entrada es historial.

## Flujos

**Subida.** El cliente envía multipart a `POST /app/labs/[slug]/documents`. La ruta valida `Origin` contra `BETTER_AUTH_URL`, rechaza `Content-Length` mayor a 10 MB + 64 KiB y corta el stream al superarlo; después `DocumentService`:

1. Valida nombre, tamaño, firma, título y origen; calcula SHA-256.
2. Prevalida permisos y destino en una transacción sin escribir.
3. Escribe el objeto (temporal + `rename`).
4. En otra transacción revalida permisos, bloquea Space SHARE → Resource SHARE (manual) o la entrada FOR UPDATE (evidencia) e inserta.
5. Si falla, borra el objeto; si el borrado falla, queda un huérfano para el barrido.

Respuestas: 201, 400 (formato), 401, 403 (origen o permiso), 404, 409 (límite), 413, 415, 422.

**Descarga.** `GET /app/labs/[slug]/documents/[documentId]` autoriza `laboratory.read`, carga el documento del laboratorio, exige `document.read` o `maintenance.read` según su tipo y transmite el objeto. Archivados, ajenos, denegados o ids inválidos: 404. Sin sesión: redirección a login.

**Archivado.** Server Action con motivo obligatorio; oculta el documento de listados y descargas, conserva fila y objeto.

**Barrido.** `pnpm documents:sweep` compara objetos y claves de `documents` (incluidas las archivadas) y lista los huérfanos con más de 24 h; `--apply` los borra.

Orden de bloqueo: autorización → Space (SHARE) → Resource (SHARE), igual que Maintenance, Usage y Reservations; la evidencia bloquea sólo su entrada. No se introducen ciclos.

## UI

- `/app/labs/[slug]/resources/[resourceId]/documents`: biblioteca del recurso, subida y archivado. Enlazada desde cada recurso del catálogo espacial («Documentos») y desde el detalle de mantenimiento.
- `/app/labs/[slug]/maintenance/resources/[resourceId]`: cada entrada muestra su evidencia, «Añadir evidencia» y archivado según permisos.

El formulario advierte que las fotos conservan sus metadatos (p. ej. GPS).

## Configuración

`DOCUMENT_STORAGE_DIR` (opcional, documentada en `.env.example`): raíz local, por defecto `.local-storage/documents`, ignorada por git y rechazada si está dentro de `public/`. El origen permitido se deriva de `BETTER_AUTH_URL`.

## Migración

`0011_documents_i.sql`: generada con `pnpm db:generate` (sólo la tabla nueva), índice único reordenado antes de las FKs, dos funciones y dos triggers manuales, tres permisos y su asignación a `laboratory_responsible`. Sin DROP, TRUNCATE ni DELETE; migraciones anteriores intactas.

## Pendientes

S3 y URLs prefirmadas (ver ADR 0016), documentos de prácticas, evidencia de incidencias, versionado y documentos compartidos, purga y retención, eliminación de EXIF/GPS, antivirus, miniaturas, auditoría persistente, Giussepe y paginación. Ver [validación](documents-validation.md).
