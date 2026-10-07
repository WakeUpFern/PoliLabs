# maintenance

Maintenance I implementa la bitácora por recurso, el estado operativo resultante y los materiales consumidos (SRS §15) mediante dominio puro, MaintenanceService, adaptadores PostgreSQL y web.

Ver [arquitectura](../../../docs/architecture/maintenance.md), [validación](../../../docs/architecture/maintenance-validation.md) y [ADR 0015 — Aceptada](../../../docs/decisions/0015-maintenance-logs.md). El estado operativo pertenece a `Resource` (Spatial) y sólo cambia mediante una entrada de bitácora. No crea órdenes ni bloqueos por intervalo, ni cancela reservaciones o usos existentes.
