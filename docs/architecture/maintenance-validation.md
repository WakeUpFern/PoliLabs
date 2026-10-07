# Validación de Maintenance I

Fecha: 7 de octubre de 2026. Node.js 24.21.0, pnpm y lockfile existente; sin dependencias ni variables nuevas. SRS original conservado. Se preservan los cambios previos de aceptación del ADR 0011 presentes al comenzar; el ADR 0014 se marcó Aceptado por indicación explícita del responsable en esta sesión.

## SQL revisado y aplicado

`0010_maintenance_i.sql` fue generado con `pnpm db:generate` y revisado. Drizzle emitía los índices únicos de soporte después de las FKs que los referencian; se reordenaron antes. Se añadieron manualmente los triggers de estado, inmutabilidad, validación de materiales y RB5 de Usage, la redefinición de `validate_reservation` (diff contra 0004 limitado a la condición de estado operativo y su mensaje) y los permisos. Sin DROP/TRUNCATE/DELETE ni schema push. Aplicada a la base `_test` mediante la integración y después a PostgreSQL local de desarrollo con `pnpm db:migrate`.

## Comandos ejecutados

| Comprobación            | Resultado                                                                         |
| ----------------------- | --------------------------------------------------------------------------------- |
| `pnpm check`            | Correcto: ESLint, TypeScript, 53 pruebas unitarias/configuración y Prettier.      |
| `pnpm test:integration` | Correcto: 138 resultados, cero fallos, PostgreSQL real (127 previos + 11 nuevos). |
| `pnpm build`            | Correcto; incluye las dos rutas nuevas de Maintenance.                            |
| `pnpm db:migrate`       | Correcto; migración aditiva aplicada al desarrollo local.                         |
| `git diff --check`      | Correcto.                                                                         |

`tests/integration/auth-postgres.test.ts` actualiza el conteo esperado de migraciones de 10 a 11.

## Cobertura

Unitarias (`tests/maintenance.test.ts`, 6): tipos, estados, origen, descripción, RB5, fecha de realización con offset y no futura, próxima fecha válida, materiales distintos/acotados/ordenados y rechazo en aplicación antes de persistir.

Integración (`tests/integration/maintenance.test.ts`, 10 subpruebas más contenedora):

- La entrada aplica el estado y conserva el anterior; listado con último y próximo mantenimiento.
- PostgreSQL rechaza cambios directos de estado, recursos nuevos no operativos y UPDATE de bitácora; las ediciones espaciales sin estado siguen funcionando.
- Permisos, aislamiento entre laboratorios, recurso inactivo y fecha futura.
- Materiales: consumo exacto, movimiento `consumption` del actor, saldo insuficiente que revierte entrada/estado/inventario, herramienta reutilizable y artículo de otro laboratorio rechazados.
- Materiales sin `inventory.adjust` rechazados; entrada sin materiales permitida.
- Incidencia del mismo recurso aceptada sin cambiar su estado; incidencia de espacio o de otro recurso rechazada.
- RB5 en reservaciones: la existente se conserva, la nueva con el recurso se rechaza, la exclusiva del espacio se permite y al volver a operativo se acepta.
- RB5 en Usage: un uso abierto sigue abierto y se cuenta en el impacto; opciones e inicio excluyen el recurso hasta volver a operativo.
- Concurrencia: un cambio de estado confirmado mientras una reservación espera el bloqueo del recurso provoca su rechazo.
- Concurrencia: dos consumos simultáneos que exceden el saldo confirman sólo uno.

## Verificación web

Las herramientas de Chrome no estaban disponibles en esta sesión, así que no hubo recorrido visual ni revisión de viewport móvil. Con `tests/e2e/maintenance-browser-fixture.ts` (base `_test`, cuentas `invalid.test`, puerto 3109) se verificó por HTTP con sesiones reales de Better Auth:

1. La ficha del laboratorio enlaza Mantenimiento para el responsable y no para el alumno; las dos rutas devuelven 404 al alumno.
2. Listado y detalle renderizan estado, incidencia del recurso, consumibles con existencia y bitácora vacía.
3. Tras registrar «fuera de servicio» con 0.5 L de aceite mediante el servicio: detalle con aviso RB5, entrada correctiva, material 0.500 y próxima fecha «15 ene 2027»; insignia en listado y catálogo; el formulario de reservación del alumno marca el recurso como no disponible y el otro como disponible.
4. SIGTERM a fixturePid limpió las fixtures sintéticas.

El envío del formulario mediante Server Action no se ejercitó en navegador; queda el recorrido manual en [maintenance-browser.md](../../tests/e2e/maintenance-browser.md).

## Límites

Fuera de alcance: órdenes y programación, bloqueos por intervalo, mantenimiento automático desde incidencias, notificaciones, alertas de stock, reportes/exportación, adjuntos, Giussepe, activos individualizados y paginación. Las reservaciones exclusivas de espacio no se cuentan en el impacto.
