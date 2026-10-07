# Recorrido web de Documents I

Con Node.js 24 y PostgreSQL local, ejecutar `pnpm build` y después `pnpm exec node --import tsx tests/e2e/documents-browser-fixture.ts` con `TEST_DATABASE_URL` apuntando a una base propia terminada en `_test` (p. ej. `labora_documents_test`). La fixture protege la base `_test`, crea dos cuentas `invalid.test` (responsable con permisos de mantenimiento y documentos; alumno sólo con lectura del laboratorio y del catálogo), un laboratorio con un espacio, dos recursos y una entrada de mantenimiento del torno. Usa un directorio temporal como `DOCUMENT_STORAGE_DIR`, inicia producción en localhost:3110 y muestra rutas, credenciales sintéticas y fixturePid. No ejecutar al mismo tiempo que la suite de integración.

1. Login responsable. En spacePath, el torno muestra el enlace «Documentos».
2. Abrir documentsPath. Subir un PDF con título: aparece en la lista con tipo, tamaño, autor y fecha. Abrirlo: se muestra en el navegador desde `/app/labs/<slug>/documents/<id>`.
3. Intentar subir un archivo de texto renombrado a `.pdf`: «Formato no admitido». Intentar un archivo de más de 10 MB: rechazo antes de enviar; con el límite del cliente desactivado, la ruta responde 413.
4. Abrir maintenancePath. La entrada muestra «Sin evidencia adjunta». En «Añadir evidencia», subir una foto JPEG/PNG: aparece bajo la entrada, cuya descripción y fecha no cambian. Abrir la imagen.
5. Archivar el PDF con motivo: desaparece de la lista y su URL responde 404.
6. Logout y login alumno. spacePath no muestra «Documentos»; documentsPath, la URL del PDF y la de la evidencia responden 404.
7. Comprobar consola y viewport móvil sin desbordamiento horizontal.

Para detener y limpiar únicamente estas fixtures sintéticas, enviar SIGTERM directamente a fixturePid y esperar el mensaje de limpieza. La fixture detiene el grupo de procesos del servidor, borra documentos, bitácora, catálogo y cuentas del laboratorio sintético y elimina su directorio temporal; nunca datos de desarrollo.
