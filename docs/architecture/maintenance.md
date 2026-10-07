# Maintenance I

## Alcance y modelo

Maintenance I fue seleccionado el 7 de octubre de 2026 tras Incidents I; el responsable aprobó explícitamente su alcance y las decisiones D1–D6 del [ADR 0015](../decisions/0015-maintenance-logs.md) (Aceptada). SRS RF25–27, §15, RB2–3, RB5 y §33.11.

- `maintenance_logs`: Laboratory, Space y Resource coherentes por FKs compuestas; responsable (actor autenticado), tipo `preventive|corrective|inspection|other`, descripción 1–5000, `status_before` y `status_after`, `performed_at` indicado por el usuario (no futuro), `next_maintenance_due` opcional (fecha), incidencia opcional del mismo recurso (FK `(incident_id, resource_id)`), origen y `created_at` del servidor con `clock_timestamp()`.
- `maintenance_materials`: vincula una entrada con movimientos `consumption` de inventario del mismo laboratorio (FKs compuestas `(log, laboratory)` y `(movement, laboratory)`; un movimiento pertenece a una sola entrada).
- `resources.operational_status`: `operational`, `in_maintenance`, `out_of_service`. Columna de Spatial (el estado es propiedad del recurso), modificable únicamente por la bitácora. `is_active` sigue significando pertenencia al catálogo.

La fecha de realización no se valida contra la creación del recurso; la próxima fecha debe ser igual o posterior a la fecha UTC de realización (comprobación básica, sin zonas horarias por laboratorio).

## Estado operativo y RB5

Un trigger `BEFORE INSERT` de `maintenance_logs` bloquea el recurso en UPDATE, exige que esté activo en el mismo Space, captura `status_before` y aplica `status_after`. Otro trigger sobre `resources` rechaza recursos nuevos no operativos y cualquier cambio directo del estado (sólo se permite desde el trigger de la bitácora, `pg_trigger_depth() >= 2`). Las entradas y sus materiales rechazan UPDATE; no hay borrado público.

RB5 se aplica a operaciones nuevas:

- **Reservations:** `resolveTarget` exige `operational` al bloquear los recursos seleccionados y la validación diferida `validate_reservation` (redefinida en esta migración, idéntica salvo esa condición) lo vuelve a comprobar con los recursos en SHARE. La reservación exclusiva del espacio no se ve afectada. El formulario marca y deshabilita los recursos no operativos.
- **Usage:** las opciones excluyen recursos no operativos; el inicio rechaza con `unavailable` tras bloquear el recurso, y un trigger `BEFORE INSERT` de `resource_usage` actúa como respaldo.

Pasar a no operativo no cancela reservaciones ni cierra usos. El detalle muestra los usos abiertos y las reservaciones futuras confirmadas que incluyen explícitamente el recurso, para que el personal decida (§16).

## Materiales y atomicidad

Bitácora, cambio de estado y consumos se guardan en una sola transacción READ COMMITTED (decisión D1). Hasta 20 consumibles distintos; cantidades con hasta tres decimales, enteras para piezas. El servicio valida formato con la aritmética exacta de Inventory; el adaptador bloquea cada artículo en orden de UUID, comprueba actividad, tipo y saldo, y después inserta los movimientos, cuyo trigger existente calcula saldos y protege RB2–3. Cualquier fallo revierte la entrada, el estado y los consumos. El movimiento lleva la nota `Mantenimiento: <recurso>` y la ubicación principal del saldo.

Registrar materiales exige `inventory.adjust` además de `maintenance.create`, revalidado con `authorizeLocked` dentro de la transacción. Sin ese permiso la UI no ofrece materiales.

## Servicios, permisos y transacciones

`MaintenanceService` (application) valida entradas, coordina permisos y delega en `MaintenanceStore.run`, que autoriza con bloqueo y abre la transacción. Operaciones: `access`, `resources`, `detail`, `options`, `record`. El dominio no depende de React, HTTP ni Drizzle; el tipo de estado operativo vive en `spatial/domain/resource.ts` y Maintenance lo reutiliza.

Permisos `maintenance.read` y `maintenance.create`, asignados por migración y bootstrap a `laboratory_responsible`. El detalle de recursos desactivados sigue legible dentro del laboratorio; registrar exige recurso y espacio activos.

Orden de bloqueo: ruta de autorización → Space (SHARE) → Resource (UPDATE) → artículos de inventario (UPDATE, orden UUID). Reservations bloquea Space y luego Resource en SHARE; Usage e Incidents siguen Space → Resource. Inventory sólo bloquea artículos. No hay ciclos.

## Flujo web

- `/app/labs/[slug]/maintenance`: recursos activos con estado, último mantenimiento y próximo.
- `/app/labs/[slug]/maintenance/resources/[resourceId]`: estado, aviso de impacto, formulario (tipo, estado resultante, fecha local America/Mexico_City, próxima fecha, descripción, incidencia y materiales) y bitácora con materiales y enlace a la incidencia.

Entradas desde la ficha del laboratorio (sustituye el marcador deshabilitado) y desde cada recurso del catálogo espacial, que también muestra una insignia si no está operativo. El servidor fija actor y origen `WEB`; los formularios no los aceptan.

## Migración

`0010_maintenance_i.sql`: dos tablas, una columna con CHECK en `resources`, seis FKs RESTRICT, cinco CHECK en la bitácora, índices de soporte `(id, laboratory_id)` en bitácora e inventario y `(id, resource_id)` en incidencias (creados antes de sus FKs dependientes), cuatro funciones y seis triggers nuevos, redefinición de `validate_reservation`, dos permisos y su asignación inicial. Sin DROP, TRUNCATE ni DELETE; migraciones anteriores intactas.

## Pendientes

Órdenes y programación de mantenimiento (`MaintenanceScheduled`, `maintenance.close`), bloqueos por intervalo (RF14), mantenimiento derivado de incidencias, adjuntos, notificaciones y alertas de stock bajo, reportes/exportación (§32), Giussepe (§27.3), activos individualizados y paginación de bitácoras. Ver [validación](maintenance-validation.md).
