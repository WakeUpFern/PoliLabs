# Reservations

Reservations I implementa servicios backend de disponibilidad, creación individual,
detalle/listado propios y cancelación lógica. Usa Space y Resource de Spatial y
AuthorizationService de Identity, sin duplicar entidades físicas ni permisos.

Consultar [arquitectura y validación](../../../docs/architecture/reservations.md) y
[ADR 0009 aceptado](../../../docs/decisions/0009-individual-reservations.md).
La UI corresponde a Reservations II. No incluye recurrencia, aprobación, Academic,
Inventory, Notifications ni Giussepe.

## Reservations II

`web/` adapta sesión, slug y formularios a los cinco servicios de aplicación. La composición `web/services.ts` se limita al servidor. La web añade listado propio, nueva reservación y detalle/cancelación bajo `/app/labs/[slug]/reservations`. No cambia dominio, persistencia, permisos ni ADR 0009. Ver [documentación](../../../docs/architecture/reservations.md).
