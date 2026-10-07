# Recorrido web de Maintenance I

Con Node.js 24 y PostgreSQL local, ejecutar `pnpm build` y después `pnpm exec node --import tsx tests/e2e/maintenance-browser-fixture.ts`. La fixture protege la base `_test`, crea dos cuentas `invalid.test` (responsable y alumno), un laboratorio con un espacio, dos recursos, 5 L de aceite consumible y una incidencia del torno. Inicia producción en localhost:3109 y muestra rutas, credenciales sintéticas y fixturePid. No ejecutar al mismo tiempo que la suite de integración.

1. Login responsable; desde labPath abrir Mantenimiento. Ambos recursos aparecen «En operación» y sin mantenimiento.
2. Abrir resourcePath. Registrar un correctivo «Fuera de servicio», próxima fecha, incidencia del torno y 0.5 de aceite. Verificar el mensaje de éxito, la entrada en la bitácora, el material y el aviso RB5.
3. Intentar otro registro con 10 L: debe mostrarse existencia insuficiente sin crear la entrada.
4. En spacePath, comprobar la insignia «Fuera de servicio» y el enlace Mantenimiento.
5. Logout y login alumno. En reservationPath, el torno aparece deshabilitado como no disponible; la fresadora sí puede seleccionarse. Mantenimiento no aparece en la ficha y sus rutas responden 404.
6. Volver como responsable y registrar «En operación»: el torno vuelve a ofrecerse en reservaciones.
7. Comprobar consola y viewport móvil sin desbordamiento horizontal.

Para detener y limpiar únicamente estas fixtures sintéticas, enviar SIGTERM directamente a fixturePid y esperar el mensaje de limpieza. La limpieza quita primero bitácoras y materiales, después inventario, incidencias, reservaciones, catálogo y cuentas del laboratorio sintético; nunca datos de desarrollo.
