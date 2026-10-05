# inventory

Estado: Inventory I implementado.

Catálogo por Laboratory, consumibles y herramientas reutilizables por cantidad, existencia principal con Location opcional y movimientos trazables. Dominio independiente, servicios autorizados con transacciones PostgreSQL y flujo web de búsqueda/alta/detalle/movimientos/edición/desactivación.

Préstamos, devoluciones, múltiples saldos, transferencias, activos individualizados y planos permanecen pendientes. Resource no se duplica.

Ver [arquitectura y políticas](../../../docs/architecture/inventory.md), [ADR 0010](../../../docs/decisions/0010-quantity-inventory.md) y [validación](../../../docs/architecture/inventory-validation.md).
