# notifications

Notifications I: centro de notificaciones in-app y correo transaccional mediante un outbox en PostgreSQL (SRS §19, §33 criterio 14).

Los módulos de negocio llaman `recordNotificationEvent` dentro de su transacción; este módulo resuelve destinatarios, crea notificaciones y entregas pendientes. El envío ocurre después del commit mediante el puerto `EmailSender`. Ver [arquitectura](../../../docs/architecture/notifications.md) y ADR 0019.
