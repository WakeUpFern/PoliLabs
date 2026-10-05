# Validación de Inventory I

Fecha: 5 de octubre de 2026. Alcance: [Inventory I](inventory.md), [ADR 0010](../decisions/0010-quantity-inventory.md).

## Pruebas incluidas

`tests/inventory-domain.test.ts` comprueba aritmética decimal exacta, límites, rechazo de entradas inválidas, piezas enteras, clasificación y exclusión del consumo de herramientas.

`tests/integration/inventory.test.ts` verifica servicios y adaptador web con PostgreSQL real: alta atómica con/sin ubicación y con saldo cero, reversión completa ante errores, origen/actor de movimientos, edición y unidades inmutables, herramientas, salidas/entradas simultáneas, permisos y revocación, aislamiento por laboratorio, restricciones SQL, preservación de historial, desactivación espacial con existencias, búsqueda y flujo de formularios hasta desactivación lógica. Sólo usa fixtures sintéticos en una base separada con sufijo `_test`; su limpieza no afecta la base operativa.

## Resultados

La primera comprobación de integración encontró PostgreSQL apagado (ECONNREFUSED). Se inició el contenedor ya definido por Compose conservando el volumen. La primera aplicación detectó que Drizzle generó la FK compuesta antes del índice único referenciado; se corrigió el orden. La primera ejecución de los triggers encontró una expresión CASE que referenciaba campos de OLD/NEW inexistentes en otra tabla; se sustituyó por ramas IF. La migración revisada conserva estos arreglos. Las pruebas específicas de Inventory pasaron posteriormente: 11 resultados incluyendo el contenedor de diez subpruebas.

La primera ejecución de `pnpm check` necesitó salir del sandbox por el socket IPC de tsx. Las 34 pruebas unitarias pasaron; se corrigieron después una advertencia de importación sin uso y diferencias de formato. Resultado final: `pnpm check` aprobado: ESLint sin errores ni advertencias, TypeScript sin errores, 34 pruebas unitarias aprobadas y Prettier sin diferencias. `git diff --check` también pasó.

- `pnpm test:integration`: 81 resultados aprobados, incluyendo Identity, Spatial y Reservations I/II. Una comprobación existente del número de migraciones se actualizó de cinco a seis. La suite también se ejecutó sobre una base nueva; las seis migraciones aplicaron correctamente, y la cuenta de ese test falló inicialmente sólo por ese contador desactualizado.
- `pnpm build`: aprobado con las tres rutas nuevas de Inventory. El primer intento encontró el fallo de sockets de Turbopack documentado en la inicialización; apartar la caché anterior en `/tmp` permitió compilar. Durante una corrección posterior del formulario se detectó una duplicación de atributos JSX y se corrigió antes de la compilación final aprobada.
- `pnpm db:migrate`: migración aditiva aplicada a la base local de desarrollo el 5 de octubre de 2026. Se conserva el volumen y los datos existentes. No se ejecutó schema push.

## Comprobación de navegador

Se utilizó el navegador integrado sobre la aplicación compilada, con una base nueva separada `_test`, una cuenta generada y datos sintéticos. `agent-browser` no estaba instalado. No se usaron credenciales de usuarios reales. Los servidores de prueba se detuvieron y las cuentas, sesiones, artículos y demás fixtures sintéticos se eliminaron de sus bases aisladas; no se borraron bases ni volúmenes.

Se verificó login → laboratorio → Inventory, búsqueda, alta con ubicación jerárquica y 1.100 L, entrada de 0.200 L (saldo 1.300), consumo de 0.300 L (saldo 1.000), rechazo de salida superior al saldo, edición de nombre y eliminación de ubicación, rechazo de desactivación con saldo, ajuste a cero, desactivación y consulta del historial mediante el filtro de desactivados. También se creó una herramienta con diez piezas, confirmando que el formulario no ofrece consumo ni devolución de préstamo.

La comprobación detectó un reinicio nativo del formulario que podía mostrar la primera unidad del selector después de guardar, sin alterar el dato persistido. Se corrigió el envío mediante useActionState/startTransition: conserva campos ante errores, mantiene tipo/unidad y limpia cantidad/motivo sólo tras un movimiento exitoso. La versión recompilada se comprobó de nuevo: unidad L conservada al editar, campos conservados ante saldo insuficiente y campos vacíos después del consumo válido. Se inspeccionaron capturas y consola, sin errores/advertencias de la aplicación.

Esta es una comprobación end-to-end ejecutada con navegador, no una suite automatizada de Playwright versionada. Las pruebas de integración versionadas cubren además manipulación de identificadores y permisos. No se afirma una matriz completa de móviles, navegadores o accesibilidad.

## Repetición

```bash
pnpm check
pnpm test:integration
pnpm build
```

Para comprobar manualmente la web, usar una cuenta de pruebas autorizada en un laboratorio de pruebas: abrir Inventario, buscar, crear un consumible con ubicación opcional y cantidad inicial decimal; comprobar detalle/historial; registrar entrada y consumo; intentar salida superior al saldo; editar nombre/ubicación; comprobar rechazo de cambio de unidad y desactivación con saldo; ajustar a cero y desactivar; buscar incluyendo desactivados. Crear una herramienta y comprobar que no ofrece consumo ni devolución de préstamo. Con un usuario de lectura, comprobar ausencia de acciones y rechazo del envío manipulado por los servicios.
