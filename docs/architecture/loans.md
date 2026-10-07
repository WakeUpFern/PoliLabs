# Loans I — Préstamos de herramientas reutilizables

Fecha: 7 de octubre de 2026. Estado: implementado. Las políticas están en el [ADR 0017](../decisions/0017-tool-loans.md) (Aceptada) y los resultados de ejecución en [validación](loans-validation.md). SRS RF20, §14.5, RB2–4 y §33.9.

## Alcance

- Préstamo y devolución de herramientas reutilizables de Inventory, por cantidad de piezas, a miembros activos del laboratorio.
- La disponibilidad se calcula como existencia − unidades pendientes de préstamos activos. El préstamo no es consumo: no genera movimientos ni cambia el saldo (RB4).
- Los consumibles quedan excluidos.
- Fuera de alcance: activos individualizados, préstamos entre laboratorios, notificaciones, prórrogas, reportes/exportación, solicitudes de alumnos, reservaciones como contexto, paginación y Giussepe.

Loans es un módulo propio (`src/modules/loans`) que pertenece conceptualmente a Inventory, igual que Attendance respecto de Academic. Reutiliza la aritmética exacta de `inventory/domain` (`quantityInThousandths`, `formatQuantity`) y las tablas de Inventory sin redefinirlas.

## Modelo

- `inventory_loans`:
  - FKs compuestas `(item_id, laboratory_id)` → `inventory_items`, `(borrower_user_id, laboratory_id)` → `laboratory_memberships` y `(session_id, laboratory_id)` → `lab_sessions` (opcional).
  - Cantidad entera positiva y `returned_quantity` mantenida por el trigger.
  - Estado `active` o `returned`, coherente por CHECK con lo devuelto y `closed_at`.
  - `loaned_at` de servidor (`clock_timestamp()`), `due_at` opcional posterior a `loaned_at`.
  - Actor, origen `WEB|API|AGENT|SYSTEM` y notas opcionales de 1–1000 caracteres.
  - Índice único `(id, laboratory_id)` creado antes de la FK que lo referencia.
  - Índice parcial por artículo para préstamos activos.
- `inventory_loan_returns`:
  - FK compuesta `(loan_id, laboratory_id)`.
  - Cantidad entera positiva y estado del material `good|damaged|lost`.
  - `movement_id` obligatorio (y único) sólo con daño o pérdida, con FK `(movement_id, laboratory_id)` → `inventory_movements`. Las notas son obligatorias en ese caso.
  - Actor, origen y `returned_at` de servidor.

## Triggers (migración `0012_loans_i.sql`)

| Trigger                                                           | Función                                                                                                                                                                                                                                                       |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `inventory_loans_apply` (BEFORE INSERT)                           | Bloquea la sesión (SHARE), al prestatario (SHARE) y el artículo (`inventory_lock_item`). Exige sesión `scheduled`/`open`, membresía y usuario activos, y herramienta activa del laboratorio. Valida cantidad ≤ disponible. Fija estado inicial y `loaned_at`. |
| `inventory_loans_guard` (BEFORE UPDATE)                           | Rechaza actualizaciones directas (`pg_trigger_depth() < 2`) y cambios de identidad, cantidad, fechas o notas.                                                                                                                                                 |
| `inventory_loan_returns_apply` (BEFORE INSERT)                    | Bloquea el artículo y luego el préstamo. Exige préstamo activo y cantidad ≤ pendiente. Si hay movimiento, debe coincidir en artículo, cantidad, actor y tipo. Acumula lo devuelto y cierra el préstamo al completarse.                                        |
| `inventory_loan_returns_immutable` (BEFORE UPDATE)                | Reutiliza `inventory_immutable_history()`.                                                                                                                                                                                                                    |
| `inventory_loans_reconcile()` (diferido, en stocks/loans/returns) | Comprueba `returned_quantity` = Σ devoluciones y **existencia ≥ Σ pendiente activo** (`loaned-stock`). Prohíbe borrar historial salvo junto con su artículo, para el desmontaje de fixtures sintéticas.                                                       |

**Cambio mínimo sobre Inventory I.** No se redefine ninguna función de `0005`. El invariante se agrega como trigger de restricción nuevo sobre `inventory_stocks`, que `inventory_apply_movement` ya actualiza en cada movimiento. Así cubre salidas, daños, pérdidas y ajustes. Desactivar un artículo ya exige saldo cero (`inventory_guard_item`), y con el invariante eso implica que no hay préstamos activos.

El trigger es diferido porque una devolución con daño inserta primero el movimiento `damage` (baja la existencia) y después la devolución que lo referencia (baja lo pendiente). El invariante sólo se cumple al final de la transacción.

En código, Inventory sólo gana el error de dominio `loaned-stock`, su mapeo en `DrizzleInventoryStore` y los textos de interfaz.

## Servicios y autorización

`LoanService` (application) recibe un `LoanStore.run(context, permission, op)`. El adaptador Drizzle abre una transacción READ COMMITTED, autoriza con `authorizeLocked` y entrega las claves de permiso efectivas.

| Operación                       | Permiso                                                                                  |
| ------------------------------- | ---------------------------------------------------------------------------------------- |
| `access`                        | `laboratory.read`                                                                        |
| `itemLoans` (totales)           | `inventory.read`; préstamos con identidades sólo si además `inventory.loan`              |
| `laboratoryLoans(filter)`       | `inventory.loan` (`active` u `overdue`)                                                  |
| `ownLoans`                      | `inventory.loan.read`                                                                    |
| `options` (miembros y sesiones) | `inventory.loan`                                                                         |
| `lend`                          | `inventory.loan`                                                                         |
| `registerReturn`                | `inventory.loan`; con daño o pérdida además `inventory.adjust` (revalidado bajo bloqueo) |

El dominio valida identificadores, piezas enteras, notas, fecha compromiso futura con offset, estado del material y filtro antes de abrir la transacción. El adaptador vuelve a bloquear y comprobar todo, y los triggers lo repiten si se omite el servicio.

La hora del servicio es inyectable (`clock`): así las pruebas comprueban vencidos sin esperar.

Actor y origen nunca vienen del formulario: el adaptador web resuelve la sesión y fija `WEB`. Futuras herramientas de Giussepe deberán pasar `AGENT` desde código confiable.

## Concurrencia

- **Préstamo:** autorización → sesión (SHARE) → prestatario (SHARE) → artículo (UPDATE).
- **Devolución:** autorización (+ `inventory.adjust`) → artículo (UPDATE) → préstamo (UPDATE).

Los movimientos de Inventory y Maintenance bloquean el mismo artículo, así que todas las escrituras de un artículo se serializan. Después de esperar el bloqueo, saldo y préstamos se leen en sentencias nuevas: READ COMMITTED ve lo que se confirmó mientras se esperaba. Ninguna ruta bloquea el artículo antes que la sesión o el prestatario, de modo que no hay ciclos.

## Interfaz

- **Detalle del artículo** (`/app/labs/[slug]/inventory/[itemId]`), sólo para herramientas:
  - Tarjetas de existencia, prestadas y disponibles.
  - Formulario de préstamo: miembro activo, piezas, compromiso opcional en America/Mexico_City, sesión opcional y notas.
  - Préstamos activos con su formulario de devolución. Daño y pérdida sólo aparecen con `inventory.adjust`.
  - Préstamos devueltos recientes.
- **`/app/labs/[slug]/loans`:**
  - «Préstamos del laboratorio» con filtros Activos y Vencidos (`inventory.loan`).
  - «Mis préstamos» (`inventory.loan.read`).
  - Responde 404 sin ninguno de los dos permisos o con un filtro inválido.
- **Ficha del laboratorio:** enlace Préstamos con cualquiera de los dos permisos.
- Server Components para lecturas, Server Actions que vuelven a autenticar, y componentes cliente con `useActionState`. Los formularios se reinician sólo tras éxito. Los listados se limitan a 100 préstamos, sin paginación.

## Despliegue

```bash
pnpm db:migrate
pnpm check
pnpm test:integration
pnpm build
```

La migración es aditiva: dos tablas, triggers nuevos y dos permisos, sin `DROP`/`DELETE` ni redefiniciones. Debe desplegarse con el código del mismo incremento porque añade el error `loaned-stock` a los movimientos de inventario. No introduce variables de entorno.
