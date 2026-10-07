# 0017 — Préstamos temporales de herramientas reutilizables

Estado: **Aceptada**

## Contexto

El responsable seleccionó Loans I después de Maintenance I. El 7 de octubre de 2026 aprobó explícitamente las decisiones D1–D5 y la interfaz descritas aquí, con dos ajustes: el permiso de lectura propia se llama `inventory.loan.read`, siguiendo la convención de `usage.read`, `incident.read`, `attendance.read` y `reservation.read`, y la «devolución» de §14.4 no se modela como el regreso de un préstamo.

[SRS](../srs/PoliLabs-SRS.tex) RF20, §14.5, RB2–4 y §33.9 piden registrar préstamos y devoluciones sin tratar el préstamo como consumo, y calcular la disponibilidad a partir de la cantidad total y las unidades prestadas. §22.2 sugiere `loans(id, item_id, quantity, borrower_id, session_id, status, loaned_at, due_at, returned_at)`. §24 nombra `inventory.loan`. Inventory I ([ADR 0010](0010-quantity-inventory.md)) dejó pendientes los préstamos y no concedió `inventory.loan`.

## Decisión

**Saldo y disponibilidad (RB4, §14.5).** Un préstamo no genera movimientos ni modifica `inventory_stocks`. La existencia sigue siendo lo que posee el laboratorio y la disponibilidad se calcula como existencia − unidades pendientes de los préstamos activos. La «devolución» de §14.4 no es el regreso de un préstamo: una devolución a un proveedor se registra con `adjustment_out`.

**D1 — Quién recibe y permisos.**

- El prestatario es un miembro activo del mismo laboratorio, con cuenta activa.
- Lo registra personal con `inventory.loan`, incluido el préstamo a uno mismo. La restricción sobre registros propios del ADR 0006 es académica y no aplica aquí.
- En este corte el alumno no puede solicitar ni registrar préstamos por su cuenta.
- La devolución la registra el personal, aunque la membresía del prestatario se haya desactivado después.
- Permisos:
  - `inventory.loan`: registrar préstamos y devoluciones, y consultar los préstamos del laboratorio con la identidad del prestatario.
  - `inventory.loan.read`: consultar sólo los préstamos propios.
  - Con `inventory.read`, el detalle del artículo muestra existencia, prestado y disponible, sin identidades.
- La migración y el bootstrap asignan los dos permisos a `laboratory_responsible`. No hay roles en el código.

**D2 — Devoluciones parciales, compromiso y vencidos.**

- `inventory_loans` guarda: artículo, laboratorio, prestatario, sesión opcional, cantidad, `returned_quantity`, estado `active`/`returned`, `loaned_at` del servidor, `due_at` opcional, `closed_at`, actor, origen y notas.
- `inventory_loan_returns` registra cada devolución (cantidad, estado del material, notas, movimiento opcional, actor, origen, hora del servidor). Sus filas no se modifican.
- Se admiten devoluciones parciales. Un trigger acumula lo devuelto y cierra el préstamo al llegar a la cantidad prestada. Otro trigger diferido exige que `returned_quantity` coincida con la suma de devoluciones.
- `due_at` es opcional y debe ser futura al crear el préstamo. No hay prórrogas en este corte.
- Vencido = préstamo activo cuyo `due_at` ya pasó. Se calcula al consultar, sin guardarse ni enviar notificaciones.

**D3 — Daño y pérdida.**

- Cada devolución se marca como `good`, `damaged` o `lost`.
- `damaged` y `lost` exigen notas y generan, en la misma transacción, un movimiento `damage` o `loss` del mismo artículo, cantidad y actor, vinculado por FK compuesta con el laboratorio. Ese movimiento reduce la existencia.
- Requieren además `inventory.adjust`, revalidado dentro de la transacción (igual que los materiales en el ADR 0015).

**D4 — Existencia nunca por debajo de lo prestado.**

- Invariante: existencia ≥ unidades pendientes de los préstamos activos.
- Se implementa con un trigger diferido nuevo `AFTER UPDATE ON inventory_stocks`, más triggers diferidos en préstamos y devoluciones. **No se redefine ninguna función de Inventory I.**
- Como todo movimiento actualiza el saldo, el trigger cubre salidas, daños, pérdidas y ajustes.
- Desactivar un artículo ya exige saldo cero, así que el invariante impide desactivarlo con préstamos activos.
- El trigger diferido permite registrar primero el movimiento de daño y después la devolución que lo referencia, y sigue verificando al confirmar.

**D5 — Alcance de artículos y contexto.**

- Sólo herramientas reutilizables, en piezas enteras. Los consumibles quedan excluidos por servicio y por trigger.
- Se puede asociar opcionalmente una `LabSession` del mismo laboratorio en estado `scheduled` u `open`, como contexto informativo. No exige que el prestatario sea participante ni crea registros de uso.
- No se asocian reservaciones en este corte.

**Concurrencia.**

- Las escrituras usan READ COMMITTED.
- Orden de bloqueo:
  - Préstamo: autorización → sesión (SHARE) → membresía y usuario del prestatario (SHARE) → artículo (UPDATE, con `inventory_lock_item`).
  - Devolución: autorización (+ `inventory.adjust` si aplica) → artículo (UPDATE) → préstamo (UPDATE).
- Los movimientos de Inventory bloquean el mismo artículo, por lo que préstamos, devoluciones y salidas se serializan por artículo.
- Los triggers revalidan relaciones, tipo, disponibilidad y saldo bajo esos bloqueos aunque se omita el servicio.

## Alternativas

- Registrar el préstamo como salida de inventario y la devolución como entrada: trata el préstamo como consumo (contradice RB4) y mezcla custodia con existencia.
- Guardar las unidades prestadas como columna en `inventory_stocks`: obliga a redefinir funciones de Inventory I y duplica un dato derivable.
- Integrar la comprobación en `inventory_apply_movement`: se descartó por aprobación explícita para no redefinir funciones de Inventory I.
- Comprobación inmediata en lugar de diferida: impide registrar en una sola transacción el movimiento de daño y la devolución que lo referencia.
- Exigir que el prestatario sea participante de la sesión, o asociar reservaciones: amplía reglas que el SRS no define.
- Préstamos solicitados por el propio alumno: requieren un flujo de aprobación y custodia fuera de este corte.

## Consecuencias

- Dos tablas nuevas, dos permisos y triggers de aplicación, inmutabilidad, conciliación e invariante de existencia, en la migración `0012_loans_i.sql`.
- Inventory sólo gana el código de error `loaned-stock` y textos de interfaz. Sus funciones SQL no cambian.
- No se crean eventos genéricos: el préstamo y sus devoluciones ya registran actor, origen y hora.
- Fuera de alcance: activos individualizados con número de serie, préstamos entre laboratorios, notificaciones y recordatorios, prórrogas, reportes exportables (§32), solicitudes de alumnos, reservaciones como contexto, paginación y Giussepe.
- No se modifica el SRS ni se aprovisiona infraestructura.

## Referencias SRS

RF16 (parcial: sin activos individualizables), RF20; RNF4–9; §§14.4–14.5, 22.2, 24–25, 30; RB2–4; §33.9. ADR 0004, 0006, 0010, 0011, 0015. Ver [arquitectura](../architecture/loans.md) y [validación](../architecture/loans-validation.md).
