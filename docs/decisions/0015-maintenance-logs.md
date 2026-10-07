# 0015 — Bitácora de mantenimiento y estado operativo de recursos

Estado: **Aceptada**

## Contexto

El responsable seleccionó Maintenance I el 7 de octubre de 2026, después de Incidents I, y aprobó explícitamente su alcance y las decisiones D1–D6 descritas aquí. [SRS](../srs/PoliLabs-SRS.tex) RF25–27, §15, §24, §25, RB2–3, RB5 y el criterio §33.11 exigen registrar mantenimiento sobre un recurso, vincular materiales consumidos y modificar el estado operativo resultante. Hasta este incremento `Resource` sólo tenía `isActive` (pertenencia al catálogo), sin estado operativo; RB5 («un recurso fuera de servicio o con mantenimiento crítico no deberá considerarse disponible») no tenía representación.

La arquitectura dejaba pendiente la atomicidad entre bitácora y consumo: §15 menciona una «transacción independiente pero vinculada», mientras RNF4–6 exigen integridad.

## Decisión

**Bitácora.** `maintenance_logs` registra, por Resource activo del laboratorio: responsable (actor autenticado), fecha de realización indicada por el usuario (no futura), tipo, descripción de 1–5000 caracteres, estado anterior y resultante, próximo mantenimiento opcional (fecha), incidencia opcional, origen y hora de registro del servidor. Las entradas son inmutables; una corrección se registra como otra entrada. No hay borrado público.

**Estado operativo (D2).** `resources.operational_status` con valores `operational`, `in_maintenance` y `out_of_service`; los recursos existentes y nuevos inician `operational`. Spatial conserva la identidad del recurso, pero el estado sólo cambia mediante una entrada de bitácora: un trigger de inserción de la bitácora bloquea el recurso, captura el estado anterior y aplica el resultante en la misma transacción; otro trigger rechaza cambios directos del estado. `isActive` (catálogo) y estado operativo son conceptos distintos.

**Tipos (D3).** `preventive`, `corrective`, `inspection`, `other`.

**Disponibilidad (RB5, D4).** Un recurso que no está `operational` se rechaza al crear reservaciones individuales que lo incluyan y al iniciar Usage. La validación diferida de reservaciones en PostgreSQL y la validación de Usage lo comprueban con el recurso bloqueado. Una reservación exclusiva del espacio no se rechaza por un recurso no operativo: el espacio sigue reservable. Cambiar a no operativo **no** cancela reservaciones futuras ni cierra usos abiertos; el detalle muestra cuántos quedan afectados para que el personal decida (§16).

**Materiales (D1, RF26).** Una entrada puede incluir hasta 20 consumibles distintos del mismo laboratorio. Cada material genera un `inventory_movement` de tipo `consumption`, vinculado mediante `maintenance_materials`. Bitácora, cambio de estado y consumos se confirman o revierten en **una sola transacción**; el saldo se revalida bajo bloqueo y no puede quedar negativo (RB2–3). Interpretamos la «transacción independiente pero vinculada» del §15 como operaciones distintas y relacionadas, no como confirmaciones separadas: no se admiten estados parciales ni compensaciones. El esquema de Inventory sólo gana un índice único para la FK compuesta.

**Incidencia (opcional).** Una entrada puede referenciar una incidencia del mismo recurso. No cambia el estado de la incidencia ni la crea automáticamente.

**Permisos (D5, D6).** `maintenance.read` (estado y bitácoras del laboratorio) y `maintenance.create` (registrar entradas y cambiar estado). Registrar materiales exige además `inventory.adjust`, revalidado dentro de la transacción. La migración y el bootstrap los asignan a `laboratory_responsible`; no se hardcodean roles. `maintenance.close` se reserva para órdenes futuras.

**Concurrencia.** READ COMMITTED. Orden de bloqueo: autorización → Space (SHARE) → Resource (UPDATE) → artículos de inventario en orden de UUID (UPDATE). Coincide con Reservations (Space antes de Resource) e Incidents/Usage (Space → Resource), evitando ciclos. Reservaciones y Usage bloquean el recurso en SHARE, por lo que se serializan con el cambio de estado.

## Alternativas

- Estado en una tabla propia de Maintenance: obliga a Reservations y Usage a consultar otro módulo para algo que es propiedad del recurso.
- Bitácora y consumos en transacciones separadas: permite bitácoras sin consumo o consumos huérfanos y exige compensaciones.
- Cancelar reservaciones o cerrar usos automáticamente: §16 reserva esa decisión al personal autorizado.
- Editar el estado desde el formulario de Spatial: perdería el responsable y el motivo del cambio.
- Órdenes de mantenimiento programadas: requieren ciclo propio y `maintenance.close`; quedan para otro incremento.

## Consecuencias

Dos tablas nuevas, una columna en `resources`, dos índices únicos de soporte (incidencias e inventario), triggers de aplicación de estado e inmutabilidad, y cambios acotados en la validación de Reservations y Usage. La UI de reservaciones marca los recursos no operativos.

Fuera de alcance: órdenes y programación (`MaintenanceScheduled`), bloqueos de disponibilidad por intervalo (RF14), mantenimiento automático desde incidencias, adjuntos, notificaciones, reportes/exportación, captura en lenguaje natural con Giussepe y activos individualizados de inventario. No se modifica el SRS ni se aprovisiona infraestructura.

## Referencias SRS

RF25–27; RNF4–9; §§15–16, 22.2, 24–25, 30; RB2–3, RB5; §33.11. ADR 0004, 0006, 0009, 0010, 0013, 0014. Ver [arquitectura](../architecture/maintenance.md).
