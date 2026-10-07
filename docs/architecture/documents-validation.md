# Validación de Documents I

Fecha: 7 de octubre de 2026. Rama `feat/documents-i` desde `cd822b3`. Node.js 24, pnpm y lockfile existente; sin dependencias nuevas. Variable nueva opcional `DOCUMENT_STORAGE_DIR`. SRS original conservado.

## SQL revisado

`0011_documents_i.sql` fue generado con `pnpm db:generate`; el diff contenía sólo la tabla `documents`, sus CHECK, FKs e índices (sin cambios en tablas existentes). Drizzle emitía el índice único de `storage_key` después de las FKs; se movió antes. Se añadieron manualmente las funciones y triggers de inmutabilidad/archivado y de límite de evidencia, los tres permisos y su asignación a `laboratory_responsible`. Sin DROP, TRUNCATE ni DELETE, sin schema push. Aplicada sólo a la base de integración propia `labora_documents_test` mediante la suite; no se ejecutó `pnpm db:migrate` sobre la base de desarrollo.

## Comandos ejecutados

| Comprobación            | Resultado                                                                                                       |
| ----------------------- | --------------------------------------------------------------------------------------------------------------- |
| `pnpm check`            | Correcto: ESLint, TypeScript, 59 pruebas unitarias/configuración (53 previas + 6) y Prettier.                   |
| `pnpm test:integration` | Correcto con `TEST_DATABASE_URL=…/labora_documents_test`: 147 resultados, cero fallos (138 previos + 9 nuevos). |
| `pnpm build`            | Correcto; incluye las rutas `documents`, `documents/[documentId]` y `resources/[resourceId]/documents`.         |

`tests/integration/auth-postgres.test.ts` actualiza el conteo esperado de migraciones de 11 a 12; `operation-fixture.ts` borra `documents` antes que las bitácoras.

## Cobertura

Unitarias (`tests/documents.test.ts`, 6): firmas PDF/PNG/JPEG/WebP y rechazo de SVG, texto, ZIP, WAVE y truncados; límite exacto de 10 MB; saneamiento de nombre (rutas, control, longitud); clave de objeto; `Content-Disposition` RFC 5987; `Origin` ausente/ajeno; rechazo por `Content-Length` y corte de un stream infinito con cancelación; el servicio rechaza tipo, tamaño, título, origen y motivo sin tocar almacenamiento ni base; adaptador local (escritura, lectura, traversal, borrado idempotente, temporales huérfanos, periodo de gracia); directorio fuera de `public/`.

Integración (`tests/integration/documents.test.ts`, 8 subpruebas más contenedora, PostgreSQL real y disco temporal):

- Manual: metadatos, clave del laboratorio sin nombre original, SHA-256, objeto en disco idéntico, listado y descarga.
- Permisos: sin `document.*` se rechazan subida, biblioteca, descarga y archivado sin crear objetos; con `document.read` se descarga el manual pero no la evidencia ni su listado (`maintenance.read`), ni se añade evidencia.
- Aislamiento: subida, listado, descarga, archivado y evidencia con otro laboratorio responden `not-found`; recurso de otro laboratorio rechazado; FKs/CHECK rechazan recurso ajeno, clave con otro prefijo y doble asociación.
- Firma falsa (texto como `.pdf`, SVG como `.jpg`) y tamaño excedido no crean filas ni objetos; un PNG nombrado `.pdf` se guarda como `image/png`.
- Bitácora inmutable: la fila completa de `maintenance_logs` no cambia tras añadir evidencia; UPDATE directo sigue rechazado; límite de 10 activas (archivar libera un lugar) en servicio y en PostgreSQL sin servicio.
- Concurrencia: con 9 evidencias, dos subidas simultáneas confirman sólo una; la rechazada no deja objeto.
- Fallo a mitad de la subida: fallo de escritura sin fila; fallo de la transacción tras escribir el objeto lo compensa; si la compensación falla queda un único huérfano que el barrido detecta sólo pasado el periodo de gracia.
- Archivado: motivo obligatorio, actor y fecha registrados, objeto conservado, oculto en listado y descarga, segundo archivado rechazado; PostgreSQL rechaza desarchivar y cualquier otro UPDATE; objeto ausente responde `unavailable`.

## Verificación HTTP

Las herramientas de navegador no se usaron en esta sesión: no hubo recorrido visual ni revisión de viewport móvil. Con `tests/e2e/documents-browser-fixture.ts` (base `labora_documents_test`, cuentas `invalid.test`, puerto 3110, almacenamiento temporal) se verificó por HTTP con sesiones reales de Better Auth, 20 comprobaciones correctas:

1. Biblioteca y catálogo espacial del responsable con enlace y formulario.
2. Subida de PDF (201) y de evidencia PNG (201); sin `Origin` o con origen ajeno 403; texto como `.pdf` 415; `Content-Length` de 20 MB 413; cuerpo chunked de 12 MB cortado con 413.
3. Descarga del PDF con bytes idénticos, `application/pdf`, `nosniff`, `private, no-store` e `inline`; PNG con `CSP sandbox`.
4. Biblioteca y bitácora muestran el manual y la evidencia sin alterar la entrada.
5. Alumno: descargas, biblioteca, ids aleatorios y malformados 404; subida 403; sin enlace «Documentos». Sin sesión: 307 a login.
6. SIGTERM a fixturePid limpió fixtures, directorio temporal y servidor.

La primera ejecución dejó vivo el proceso `next-server` (nieto de `pnpm start`) en el puerto 3110; se detuvo manualmente y la fixture ahora inicia el servidor en su propio grupo de procesos y lo termina completo. La fixture de Maintenance comparte ese patrón y no se modificó. El archivado por Server Action no se ejercitó por HTTP; queda en el [recorrido manual](../../tests/e2e/documents-browser.md).

## Límites

Sin S3, URLs prefirmadas, documentos de prácticas, evidencia de incidencias, versionado, purga, antivirus, miniaturas, auditoría persistente ni Giussepe. Las fotos conservan EXIF (posible ubicación GPS). Los PDF se sirven sin `CSP sandbox`.
