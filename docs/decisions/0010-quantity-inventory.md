# 0010 — Inventario por cantidad y movimientos trazables

Estado: **Aceptada**

## Contexto

El responsable seleccionó Inventory como siguiente incremento y aprobó explícitamente la propuesta corregida y su implementación el 5 de octubre de 2026. El alcance debe reutilizar Laboratory, AuthorizationService y Location sin duplicar recursos individualizados ni implementar todo el SRS.

Referencias: SRS RF15–22, RNF4–6 y RNF9, §§12, 14, 22, 24–25, flujo de alta de material §28/27.2, RB2–4 y RB10, §30. ADR 0002, 0003, 0004 y 0006. El SRS original no se modifica.

## Decisión

Inventory I introduce catálogo por laboratorio, existencia principal con ubicación opcional, movimientos y trazabilidad de cambios de catálogo. Los tipos iniciales son consumible y herramienta reutilizable. Cada cambio de saldo se produce mediante un movimiento dentro de una transacción PostgreSQL, con actor, motivo y origen. No se permite saldo negativo. Se ofrecen búsqueda, alta, edición, desactivación, detalle e historial mediante los mismos servicios de aplicación autorizados.

Los recursos físicos individualizados conservan su identidad en Spatial. Su relación definitiva con Inventory y la incorporación de activos individualizables permanecen pendientes. No se crea otra identidad para maquinaria existente. Los préstamos y sus devoluciones, transferencias, múltiples saldos por artículo y representación gráfica se entregarán en incrementos posteriores.

## Alternativas

- Una identidad genérica para material y maquinaria: mezcla cantidades y activos individuales sin definir su relación.
- Editar el saldo directamente: pierde trazabilidad y contradice RB3.
- Obligación de capturar ubicación o una profundidad fija: contradice RF17 y RB10.
- Implementar préstamos, planos y activos desde el primer corte: amplía el alcance aprobado.

## Consecuencias

El corte es incremental; no completa RF16, RF20 ni los criterios completos del MVP. La ubicación principal puede refinarse, conservando la referencia histórica de cada movimiento. El catálogo con saldo cero existe independientemente de Spatial.

La implementación inicial usa NUMERIC(18,3), aritmética exacta, una fila de saldo por artículo y bloqueo del artículo en READ COMMITTED. PostgreSQL aplica el saldo al insertar movimientos y comprueba su conciliación al finalizar la transacción. Estas elecciones concretas y las políticas de edición/desactivación están descritas en [Inventory I](../architecture/inventory.md); no introducen reglas institucionales nuevas.

El paso a múltiples saldos requerirá una migración versionada y reglas explícitas de transferencias y unicidad para ubicaciones nulas. El alcance por Laboratory y la separación catálogo/saldos/movimientos permiten esa evolución sin redefinir la identidad del artículo. No se implementa anticipadamente esa capacidad.
