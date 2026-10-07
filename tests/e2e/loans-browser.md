# Recorrido web de Loans I

Con Node.js 24 y PostgreSQL local, ejecutar `pnpm build` y después `TEST_DATABASE_URL=<url de una base propia terminada en _test> pnpm exec node --import tsx tests/e2e/loans-browser-fixture.ts`. La fixture protege la base `_test`, crea dos cuentas `invalid.test` (responsable y alumno), un laboratorio, 5 pinzas reutilizables, 5 L de aceite consumible y un préstamo de 2 pinzas al alumno con fecha compromiso a dos minutos. Inicia producción en localhost:3111 y muestra rutas, credenciales sintéticas y fixturePid. No ejecutar al mismo tiempo que la suite de integración.

1. Login responsable; desde labPath abrir Préstamos. «Activos» muestra el préstamo del alumno con 2 pz pendientes y su fecha compromiso.
2. Esperar a que pase la fecha compromiso y abrir «Vencidos»: el préstamo aparece con la insignia «Vencido». No se envía ninguna notificación.
3. Abrir itemPath: existencia 5, prestadas 2, disponibles 3. Registrar un préstamo de 3 pinzas a «Responsable de prueba» (préstamo propio) sin fecha. Disponibles pasa a 0 y el formulario indica que no hay piezas disponibles; el historial de movimientos no cambia.
4. Registrar un movimiento «Ajuste de salida» de 1 pieza: debe mostrarse que la existencia no puede quedar por debajo de lo prestado, sin cambiar el saldo.
5. En el préstamo del alumno, devolver 1 pieza «Con daño» con nota. Verificar el mensaje con 1 pendiente, la devolución en la tarjeta y un movimiento «Daño» en el historial; existencia 4, prestadas 4.
6. Devolver la pieza restante «En buen estado»: el préstamo pasa a «Préstamos devueltos recientes».
7. Abrir el detalle del aceite: no aparece la sección de préstamos.
8. Logout y login alumno. La ficha muestra Préstamos; la página sólo incluye «Mis préstamos» con su préstamo devuelto, sin enlace al artículo (no tiene `inventory.read`). itemPath responde 404.
9. Comprobar consola y viewport móvil sin desbordamiento horizontal.

Para detener y limpiar únicamente estas fixtures sintéticas, enviar SIGTERM directamente a fixturePid y esperar el mensaje de limpieza. La limpieza quita primero devoluciones y préstamos, después inventario, membresías y cuentas del laboratorio sintético; nunca datos de desarrollo.
