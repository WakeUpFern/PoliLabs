# Recorrido web de Incidents I

Con Node.js 24 y PostgreSQL local, ejecutar `pnpm build` y después `pnpm exec node --import tsx tests/e2e/incidents-browser-fixture.ts`. La fixture protege la base `_test`, crea tres cuentas `invalid.test`, un laboratorio, Resource/Location, sesión abierta, uso previo sintético y uso activo propio. Inicia producción en localhost:3108 y muestra rutas, credenciales sintéticas y fixturePid. No ejecutar al mismo tiempo que la suite de integración.

1. Login alumno y abrir usagePath: Reportar problema preselecciona recurso y uso propio.
2. Completar descripción/severidad; guardar y abrir detalle. Ver autor, snapshot espacial, uso asociado y evento, sin usos de otras personas.
3. Abrir spaceReportPath: reportar un problema sin uso asociado.
4. Abrir sessionReportPath: reportar una anomalía de sesión.
5. Logout, login responsable y abrir reviewPath. Revisar el reporte de Resource, el uso asociado y el uso previo; comprobar la aclaración de ausencia de responsabilidad automática.
6. Pasar a revisión con nota y resolver con nota. Verificar estados, resolución, hora e historial con actor.
7. Volver como alumno: consultar propios y seguimiento; no debe aparecer formulario de gestión ni nombres del historial de otros usuarios.
8. Comprobar consola y viewport móvil sin desbordamiento horizontal.

Para detener y limpiar únicamente estas fixtures sintéticas, enviar SIGTERM directamente a fixturePid; esperar el mensaje de limpieza. No terminar abruptamente el envoltorio pnpm/tsx. La limpieza quita primero incidentes/eventos y después los usos/participación/catálogo/cuentas del laboratorio sintético; nunca datos de desarrollo.
