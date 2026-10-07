# 0016 — Documentos, almacenamiento de objetos y evidencia de mantenimiento

Estado: **Aceptada**

## Contexto

El responsable seleccionó Documents I el 7 de octubre de 2026, después de Maintenance I, y aprobó explícitamente el alcance, los permisos, los formatos, el modelo de tablas, la política de borrado y la consistencia propuestos, con dos ajustes: subidas mediante un route handler dedicado (en lugar de ampliar el límite de Server Actions) y registrar como pendiente la eliminación de metadatos EXIF. [SRS](../srs/PoliLabs-SRS.tex) RF24, RNF7, RNF10, §11 (S3 para manuales, documentos y evidencias), §18, §22.1 (`documents`), §§24–25, §30, §31 y el criterio §33.13 exigen documentos almacenados fuera de la base, con metadatos, asociaciones y permisos en PostgreSQL, y acceso protegido. El ADR 0005 ya decidía separar binarios y usar adaptadores; Maintenance I (ADR 0015) dejó los adjuntos como pendiente. Caso real: el profesor escribe su bitácora a mano y quiere subir una foto del escrito o del recurso reparado.

La tabla de componentes AWS citada en la solicitud como §5 está en §11 del SRS; §5 contiene los principios PD1–PD6.

## Decisión

**Almacenamiento.** Puerto `ObjectStorage` (`put`, `get`, `delete`, `list`) en `application/`. Único adaptador en este corte: disco local (`LocalDiskObjectStorage`), con raíz `DOCUMENT_STORAGE_DIR` (por defecto `.local-storage/documents`, ignorada por git y rechazada dentro de `public/`). Escritura en temporal y `rename` atómico. Claves aleatorias `documents/<laboratoryId>/<uuid>` que no derivan del nombre ni se exponen. No se implementa el adaptador S3 ni se aprovisiona AWS; la sección «S3 posterior» describe cómo se añadirá.

**Metadatos.** Tabla única `documents`: laboratorio, clave de objeto única, nombre original saneado (≤ 255), título opcional para manuales (≤ 200), tipo MIME verificado, tamaño, SHA-256 calculado en el servidor, quién subió, origen (`WEB/API/AGENT/SYSTEM`), fecha del servidor y archivado lógico (`archived_at`, `archived_by`, `archive_reason`). Los binarios nunca entran en la base.

**Asociaciones.** Exactamente una por documento (`num_nonnulls = 1`):

- Manual de un Resource (`resource_id` + `space_id`), FKs compuestas `(resource_id, space_id) → resources` y `(space_id, laboratory_id) → spaces`.
- Evidencia de una entrada de mantenimiento (`maintenance_log_id`), FK `(maintenance_log_id, laboratory_id) → maintenance_logs`. La bitácora sigue inmutable: la evidencia se añade después en otra tabla y la entrada sólo se bloquea, nunca se actualiza.

Se prefirió la tabla única a tablas puente porque hoy cada documento tiene un solo propietario; un manual compartido por varios recursos requerirá revisar el modelo.

**Formatos y tamaño.** PDF, PNG, JPEG y WebP, identificados por firma de bytes; la extensión y el `Content-Type` del cliente se ignoran. Excluidos: SVG (scripts), HEIC (sin vista previa), Office/ZIP (firma ambigua) y texto. Máximo 10 MB por archivo, un archivo por envío y hasta 10 evidencias activas por entrada (las archivadas no cuentan). Tamaño, tipo, checksum, clave y límite de evidencia también se comprueban en PostgreSQL (CHECK y trigger).

**Permisos.** `document.read` (consultar y descargar documentos de recursos), `document.upload` (subir manuales; con `maintenance.create`, añadir evidencia) y `document.archive` (archivar con motivo). La evidencia es parte de la bitácora: verla exige `maintenance.read`, no `document.read`. Cualquier persona con `maintenance.create` y `document.upload` en el laboratorio puede añadir evidencia, no sólo el autor de la entrada; se registra por separado quién subió. Archivar evidencia exige además `maintenance.read`. Migración y bootstrap asignan los tres permisos a `laboratory_responsible`; no se hardcodean roles.

**Subida.** Route handler `POST /app/labs/[slug]/documents`, separado de las Server Actions (que conservan su límite por defecto). Exige `Origin` igual al de `BETTER_AUTH_URL`; rechaza por `Content-Length` y corta el stream en cuanto supera 10 MB más 64 KiB de margen multipart, antes de leer el cuerpo completo; reutiliza `DocumentService` con la misma autorización. El resto de la UI (archivado) usa Server Actions.

**Descarga.** Sólo mediante `GET /app/labs/[slug]/documents/[documentId]`, que revalida membresía, laboratorio y permiso según el tipo de documento en cada solicitud. Denegado, ajeno, archivado o inexistente responden 404 indistinguible. Cabeceras: tipo verificado, `nosniff`, `private, no-store`, `inline` con `filename*` RFC 5987, `CORP same-origin` y `CSP sandbox` para imágenes. Nada se sirve desde `public/`.

**Consistencia.** (1) Prevalidación de archivo, permisos y destino sin escribir nada. (2) `put` del objeto con clave nueva. (3) Transacción READ COMMITTED que revalida con `authorizeLocked`, bloquea el destino (Space SHARE → Resource SHARE, o la entrada de bitácora FOR UPDATE) e inserta. (4) Si la transacción falla, se borra el objeto (compensación) sin ocultar el error original. (5) Si la compensación falla o el proceso muere, el objeto queda huérfano: `pnpm documents:sweep` lista los objetos sin fila con más de 24 h (también temporales interrumpidos) y sólo borra con `--apply`. Nunca se confirma una fila sin objeto; si el objeto faltara, la descarga responde «no disponible».

**Borrado.** Sólo lógico, una vez y con motivo, también para evidencia. El objeto y la fila se conservan; un trigger rechaza cualquier otro UPDATE. La purga física queda para una política de retención.

**Incidencias.** No entran en este corte: requieren decidir quién ve fotos de terceros cuando `incident.read` es sólo propio, qué ocurre tras la resolución y el tratamiento de datos personales. El modelo las admitirá con una columna `incident_id` adicional en la asociación exclusiva.

## S3 posterior

Añadir `S3ObjectStorage` con `@aws-sdk/client-s3` que implemente el mismo puerto, seleccionado en `infrastructure/services.ts` mediante una variable (`DOCUMENT_STORAGE_DRIVER=local|s3`, bucket y región). Bucket privado con Block Public Access, cifrado SSE y sin ACL públicas; credenciales por rol de ejecución, no en el repositorio. La descarga seguirá pasando por la ruta autorizada (proxy) o, tras autorizar, por URLs prefirmadas de corta duración. El barrido usará `ListObjectsV2` con el mismo criterio de gracia. Requiere autorización explícita para aprovisionar recursos.

## Alternativas

- Ampliar `serverActions.bodySizeLimit`: cambio global que afecta todas las acciones y no permite cortar el stream; rechazada por el responsable.
- Binarios en PostgreSQL: contradice RNF7, §18 y §30.
- Tablas puente por asociación: más joins sin un caso muchos a muchos actual.
- Fila `pending` antes del objeto (dos fases): más estados y limpieza en la base; la compensación más barrido cubre el mismo riesgo.
- Servir desde `public/` o con URL derivada del nombre: adivinable y sin autorización.
- Detección de tipo por extensión: permite disfrazar contenido activo.
- Borrado físico: pierde trazabilidad de evidencia.

## Consecuencias

Una tabla nueva, dos funciones y dos triggers (inmutabilidad salvo archivado; límite de evidencia), tres permisos, una variable de entorno opcional, un script de barrido y dos rutas HTTP. Sin cambios en tablas existentes ni en la bitácora; sin dependencias nuevas.

Pendientes explícitos: adaptador S3 e infraestructura AWS; URLs prefirmadas; documentos de prácticas (segunda mitad de RF24); evidencia de incidencias; versionado y documentos compartidos entre recursos; purga física y retención; antivirus; miniaturas; recuperación por Giussepe (§18) y auditoría persistente (§25). **Las fotos pueden incluir metadatos EXIF con ubicación GPS, modelo del dispositivo y fecha; en este corte no se eliminan ni se reescriben, y la UI lo advierte.** Los PDF se sirven `inline` sin `CSP sandbox` porque Chromium no los renderiza en documentos aislados; dependen del tipo verificado y `nosniff`.

## Referencias SRS

RF24; RNF4–7, RNF9–10; §§11, 18, 22.1, 24–25, 30–31; §33.13. ADR 0003, 0004, 0005, 0006, 0015. Ver [arquitectura](../architecture/documents.md) y [validación](../architecture/documents-validation.md).
