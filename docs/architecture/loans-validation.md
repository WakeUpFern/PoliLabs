# Validación de Loans I

Fecha: 7 de octubre de 2026. Node.js 24.21.0, pnpm y lockfile existente; sin dependencias ni variables nuevas. SRS original conservado. Rama `feat/loans-i` desde `cd822b3`, trabajada en un worktree propio para no interferir con el incremento paralelo de documentos.

## SQL revisado y aplicado

`0012_loans_i.sql` fue generado con `pnpm db:generate --name loans_i` y revisado:

- Drizzle emitía el índice único `inventory_loans_id_laboratory_idx` después de la FK `inventory_loan_returns_loan_laboratory_fk`, que lo referencia. Se movió antes de las FKs. Los demás índices de soporte ya existían (`inventory_items_id_lab_idx`, `inventory_movements_id_lab_idx`, `lab_sessions_id_laboratory_idx` y el único de membresías).
- Se añadieron a mano los triggers de aplicación, guarda, devolución, inmutabilidad y conciliación diferida, y el alta y asignación de `inventory.loan` e `inventory.loan.read`.
- **No se redefine ninguna función de Inventory I**, así que no hay diff contra `0005`. Se reutilizan `inventory_lock_item()` e `inventory_immutable_history()`.
- Sin DROP/TRUNCATE/DELETE ni schema push.

La primera aplicación falló en la base de pruebas con un error de sintaxis. Dentro de un `IF` de PL/pgSQL, un `CASE … THEN` cortaba la condición. La migración se revirtió completa (el migrador usa una transacción) y se corrigió calculando el tipo esperado en una variable.

La migración se aplicó sólo a la base propia `labora_loans_test`, mediante la suite de integración. **No se ejecutó `pnpm db:migrate` sobre la base de desarrollo**, por indicación de coordinación.

## Comandos ejecutados

`TEST_DATABASE_URL` apuntó a `labora_loans_test`, derivada en tiempo de ejecución sin imprimir la URL.

| Comprobación            | Resultado                                                                                     |
| ----------------------- | --------------------------------------------------------------------------------------------- |
| `pnpm check`            | Correcto: ESLint, TypeScript, 61 pruebas unitarias/configuración (53 previas + 8) y Prettier. |
| `pnpm test:integration` | Correcto: 153 resultados, cero fallos, PostgreSQL real (138 previos + 15 nuevos).             |
| `pnpm build`            | Correcto; incluye la ruta nueva `/app/labs/[slug]/loans`.                                     |

`tests/integration/auth-postgres.test.ts` actualiza el conteo esperado de migraciones de 11 a 12. `tests/integration/operation-fixture.ts` borra devoluciones y préstamos del laboratorio sintético antes de los movimientos, dentro del desmontaje existente.

## Cobertura

Unitarias (`tests/loans.test.ts`, 8):

- Piezas enteras positivas.
- Disponibilidad y pendiente exactos.
- Devolución acotada por lo pendiente y préstamo cerrado.
- Mapeo de daño y pérdida a movimientos.
- Fecha compromiso con offset y futura.
- Vencido derivado.
- Notas, filtros y origen acotados.
- Rechazo de entradas inválidas antes de abrir la transacción.

Integración (`tests/integration/loans.test.ts`, 14 subpruebas más contenedora):

- El préstamo conserva la existencia y el historial de movimientos, y reduce la disponibilidad. Devolución parcial, exceso rechazado, cierre al completar y préstamo cerrado rechazado. Se comprueba la trazabilidad de actor, origen, fechas y prestatario.
- Se rechazan cantidad mayor a la disponible, fracciones o cero, consumibles (también por inserción directa en PostgreSQL), artículos de otro laboratorio y compromisos pasados.
- Prestatario: el préstamo propio funciona; una membresía desactivada o un usuario inexistente se rechazan, y las opciones sólo ofrecen miembros activos.
- Sesión opcional del laboratorio: se acepta programada y se rechaza cancelada o inexistente.
- Permisos: sin `inventory.loan` no se presta ni se lista el laboratorio. `inventory.loan.read` muestra sólo lo propio. `inventory.read` ve totales sin identidades.
- Daño y pérdida: movimiento vinculado con tipo, cantidad, saldo y actor correctos; notas obligatorias; sin `inventory.adjust` se rechaza y no cambia la existencia. La devolución en buen estado sí se permite.
- Existencia ≥ prestado: `adjustment_out` y `loss` que dejarían la existencia por debajo de lo prestado fallan con `loaned-stock`; la salida dentro de lo disponible se acepta; la desactivación con préstamos activos se rechaza.
- Historial: PostgreSQL rechaza UPDATE de préstamos y devoluciones, el borrado de préstamos con el artículo vigente y una devolución con daño cuyo movimiento no coincide.
- Vencidos con reloj inyectado: el filtro `overdue` incluye sólo préstamos con compromiso pasado; un filtro inválido se rechaza.
- **Concurrencia:**
  - Dos préstamos simultáneos que exceden lo disponible confirman sólo uno.
  - Una devolución confirmada mientras un préstamo espera el bloqueo libera la unidad para ese préstamo.
  - Una devolución y un préstamo simultáneos se serializan por artículo, con un resultado coherente en cualquier orden.
  - Una salida de inventario y un préstamo simultáneos que juntos excederían la existencia confirman sólo uno.
  - Una pérdida confirmada mientras un préstamo espera hace que el préstamo se rechace.

## Verificación web

No hubo herramientas de navegador en esta sesión, así que no hubo recorrido visual ni revisión de viewport móvil. Con `tests/e2e/loans-browser-fixture.ts` (base `labora_loans_test`, cuentas `invalid.test`, puerto 3111) se verificó por HTTP con sesiones reales de Better Auth:

1. La ficha del laboratorio enlaza Préstamos para el responsable y para el alumno.
2. Responsable: `/loans` muestra el préstamo del alumno en Activos. El detalle de la herramienta muestra existencia/prestadas/disponibles, el formulario de préstamo y los préstamos activos. Un filtro inválido responde 404.
3. Alumno: `/loans` muestra sólo «Mis préstamos», sin enlace al artículo. El detalle del artículo responde 404 (sin `inventory.read`).
4. Los pasos 3–6 de la guía se reprodujeron **mediante los servicios**, no con Server Actions:
   - Préstamo propio de 3 piezas.
   - Ajuste de salida rechazado con `loaned-stock`.
   - Devolución de 1 pieza con daño (existencia 4, prestadas 4) y devolución final en buen estado.
   - El detalle renderiza el movimiento «Daño», la nota, la sección de devueltos y los totales 4/3/1. El alumno ve su préstamo devuelto con la línea «con daño».
5. SIGTERM a fixturePid limpió las fixtures; se comprobó en la base: cero laboratorios, cuentas, préstamos y artículos sintéticos.

Durante la primera verificación, `pnpm start` no reenvió SIGTERM a `next-server` y el puerto 3111 quedó ocupado. Se detuvo ese proceso tras confirmar que era de este worktree. La fixture ahora lanza la vista previa en su propio grupo de procesos y lo detiene completo; se comprobó que el puerto queda libre. La fixture de Maintenance tiene el mismo patrón y no se modificó.

El envío de formularios mediante Server Action y el filtro «Vencidos» con un préstamo realmente vencido no se ejercitaron en navegador. El vencido sí está cubierto por la integración con reloj inyectado. Queda el recorrido manual en [loans-browser.md](../../tests/e2e/loans-browser.md).

## Límites

Fuera de alcance: activos individualizados, préstamos entre laboratorios, notificaciones y recordatorios, prórrogas, reportes/exportación (§32), solicitudes de alumnos, reservaciones como contexto, paginación y Giussepe. Los listados muestran hasta 100 préstamos.

## Integración con Documents I

Al rebasear sobre Documents I (que introdujo `0011_documents_i.sql`), la migración de Loans se renumeró a `0012_loans_i.sql`. Se regeneraron snapshot y journal con `pnpm db:generate`; las 15 sentencias generadas coinciden con las del SQL revisado original, que se conserva íntegro (índices únicos antes de sus FKs y 13 sentencias manuales). El conteo esperado en `auth-postgres.test.ts` pasa a 13.
