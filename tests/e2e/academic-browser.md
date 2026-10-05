# Academic I — recorrido de navegador

Usar Node.js 24 y ejecutar `pnpm build`, luego `pnpm exec tsx tests/e2e/academic-browser-fixture.ts`. El fixture usa exclusivamente la base aislada con sufijo `_test`; publica una vista en `localhost:3107` y emite cuentas sintéticas de responsable/alumno y una sesión de ejemplo. No usar datos reales ni el servidor de desarrollo contra la base habitual para este guion. Al terminar, SIGINT/SIGTERM elimina sólo las filas del fixture y detiene su vista.

Comprobación manual E2E ejecutada mediante el navegador integrado:

1. Iniciar sesión como responsable; entrar al laboratorio y a Prácticas. Crear otro borrador con título/instrucciones; comprobar detalle, estado Borrador y ausencia de formulario de sesiones.
2. Publicar; verificar Publicada y formulario de programación. Seleccionar espacio y participante; enviar inicio posterior al fin. Debe mostrar error y conservar horario, espacio y casilla.
3. Corregir el fin; crear sesión y comprobar espacio, docente, horario de Ciudad de México y participante en detalle.
4. Editar horario y guardar; abrir sesión. Desaparecen edición y formulario de participantes.
5. Cerrar la sesión de autenticación desde el encabezado; entrar como alumno y abrir la sesión. Verificar inscripción e intervalo; sin padrón ni acciones administrativas. La práctica muestra sólo sus sesiones.
6. Regresar como responsable. Crear sesión adicional si hace falta. Pulsar Cancelar sesión y Volver; debe permanecer Programada. Abrir y pulsar Cerrar sesión académica, luego Confirmar; debe quedar Cerrada y conservar participantes.
7. Programar otra sesión y confirmar su cancelación; debe quedar Cancelada y conservar participantes.
8. Cerrar práctica mediante confirmación interna; debe conservar la lista de sesiones cerradas/canceladas y retirar edición/programación.
9. Revisar consola y captura de la práctica con su historial. Detener fixture y comprobar mensaje de limpieza.

Permisos manipulados, relaciones cruzadas, conflictos concurrentes y restricciones PostgreSQL se verifican automatizadamente en `tests/integration/academic.test.ts`; no se atribuyen al recorrido manual de navegador. La consulta de alumnos a prácticas cerradas no forma parte de este flujo inicial.
