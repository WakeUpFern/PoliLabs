# Incidents

Incidents I implementa reportes sobre Resource, Space o LabSession, Usage propio opcional, seguimiento y resolución con eventos transaccionales. Usa identidad y permisos del laboratorio; el historial previo no determina culpabilidad.

Ver [arquitectura](../../../docs/architecture/incidents.md), [validación](../../../docs/architecture/incidents-validation.md) y [ADR 0014 — Propuesta](../../../docs/decisions/0014-operational-incidents.md). Dominio puro, IncidentService, adaptadores PostgreSQL y web; no crea bloqueos de disponibilidad ni mantenimiento automáticamente.
