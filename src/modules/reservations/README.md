# Reservations

Reservations I implementa servicios backend de disponibilidad, creación individual,
detalle/listado propios y cancelación lógica. Usa Space y Resource de Spatial y
AuthorizationService de Identity, sin duplicar entidades físicas ni permisos.

Consultar [arquitectura y validación](../../../docs/architecture/reservations.md) y
[ADR 0009 propuesto](../../../docs/decisions/0009-individual-reservations.md).
La UI corresponde a Reservations II. No incluye recurrencia, aprobación, Academic,
Inventory, Notifications ni Giussepe.
