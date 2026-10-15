# 0019 — Notificaciones in-app y correo transaccional mediante outbox

Estado: **Propuesta** (14 de octubre de 2026; implementada en Notifications I, pendiente de aprobación explícita del responsable)

## Contexto

§33.14 exige «generar una notificación in-app y enviar un correo para un evento transaccional definido»; §34.1 sitúa «notificaciones in-app y correo transaccional esencial» en la V1. §19.1 pide que los módulos de negocio no envíen correos directamente, sino que emitan eventos que el módulo de notificaciones transforme en comunicaciones; §19.2 reserva el correo para eventos importantes o críticos, inicialmente con Amazon SES mediante un proveedor desacoplado; §19.3 admite notificaciones transaccionales obligatorias por política; §22 sugiere `notifications`, `notification_deliveries` y `notification_preferences`. [ADR 0005](0005-external-adapters.md) acepta adaptadores concretos y que las notificaciones consuman eventos, sin bus anticipado; la arquitectura dejaba pendiente decidir entrega durable y reintentos antes de implementarlos.

El SRS no define qué evento es el «transaccional definido», quién lo recibe, ni la garantía de entrega. Push, PWA, recordatorios programados y preferencias completas pertenecen a V1.5 (§34.2).

## Decisión

**D1 — Eventos iniciales.** Incidents I emite dos eventos, los únicos de este corte:

| Evento             | Destinatarios                                                                            | In-app | Correo                    |
| ------------------ | ---------------------------------------------------------------------------------------- | ------ | ------------------------- |
| `IncidentReported` | Miembros activos del laboratorio con `incident.review`, excepto quien reporta            | Sí     | Sólo con severidad `high` |
| `IncidentResolved` | Quien reportó, si sigue siendo miembro activo con `incident.read` y no es quien resolvió | Sí     | Sí                        |

`IncidentReported` corresponde al ejemplo `IncidentCreated` de §19.1 y §26 (se conserva el verbo del dominio de Incidents I) y su resolución cierra el ciclo con quien reportó. Ambos se consideran transaccionales obligatorios (§19.3): no hay preferencias en este corte.

**D2 — Emisión en la misma transacción (outbox).** El adaptador de Incidents llama `recordNotificationEvent(tx, evento)` dentro de su transacción. El módulo de notificaciones resuelve destinatarios por membresía y permiso en ese momento e inserta las notificaciones y, si corresponde, una entrega `email` en estado `pending`. Todo se confirma o revierte con el cambio de negocio; Incidents no conoce destinatarios, plantillas ni proveedores. Un índice único por destinatario, tipo y referencia hace idempotente la reemisión.

**D3 — Envío después del commit y reintentos.** Nada se envía dentro de la transacción. Tras confirmar, la Server Action programa con `after()` un despacho de mejor esfuerzo que no afecta la respuesta. `pnpm notifications:dispatch` procesa lo pendiente y reintenta. Cada intento ocurre en su propia transacción y bloquea la entrega con `FOR UPDATE SKIP LOCKED`, de modo que despachadores concurrentes no envían la misma fila. Los fallos se reintentan con espera exponencial (1, 2, 4 y 8 minutos) hasta 5 intentos y quedan en `failed`. La garantía es _al menos una vez_: una caída entre el envío y el commit puede repetir un correo; el adaptador usa el id de la entrega como `Message-ID` para que se pueda deduplicar. La programación periódica del despacho (cron, EventBridge, worker) queda pendiente.

**D4 — Proveedor.** Puerto `EmailSender`. El único adaptador es `FileEmailSender`, que escribe un `.eml` RFC 5322 por entrega en `EMAIL_OUTBOX_DIR` (por defecto `.local-storage/email-outbox`, ignorado por git), sin red. `EMAIL_TRANSPORT=disabled` deja las entregas pendientes. El adaptador de Amazon SES no se implementa ni se aprovisiona: requiere SDK, cuenta y dominio verificados.

**D5 — Contenido y datos personales.** Título y cuerpo fijos con nombre del objetivo, espacio y severidad conservados al reportar. La descripción libre no se copia a notificaciones ni correos; el mensaje enlaza a la ficha, que vuelve a autorizar. El correo se dirige a `users.email` vigente al enviar; la dirección usada se registra sólo cuando el proveedor acepta el mensaje. Los errores se guardan como código (`send-failed`), sin texto del proveedor.

**D6 — Centro de notificaciones.** `/app/notifications` lista las 50 más recientes propias; abrir una la marca leída (conservando la primera lectura) y navega a la ficha con el alcance adecuado (`laboratory` para revisión, `own` para quien reportó); se pueden marcar todas como leídas. El menú muestra el número sin leer. Sólo se muestran y se envían notificaciones de laboratorios donde la membresía y el laboratorio siguen activos; una entrega a un usuario o membresía inactivos queda `skipped`. Leer notificaciones propias no requiere un permiso de laboratorio.

## Alternativas

- Enviar el correo dentro de la transacción de Incidents: acopla la escritura al proveedor y puede enviar correos de cambios revertidos.
- Bus o cola (EventBridge, SQS): §26 admite un bus interno al inicio y §§26–27 prevén servicios administrados después; no hay infraestructura aprovisionada y el outbox en PostgreSQL basta para el volumen de un laboratorio y puede alimentar una cola más adelante.
- SMTP local con Mailpit y `nodemailer`: añade dependencia y servicio en Compose sin acercar el adaptador SES; el `.eml` se abre en cualquier cliente.
- Destinatarios resueltos al enviar: evitaría notificar a quien perdió el permiso entre la emisión y el envío, pero la notificación in-app ya debe existir al confirmar; se conserva el filtro de membresía activa al enviar.
- Copiar la descripción al correo: más útil, pero expone texto libre fuera del control de permisos.

## Consecuencias

- Migración aditiva `0013_notifications_i.sql`: tablas `notifications` y `notification_deliveries` con restricciones de tipo, estado, intentos y coherencia de envío. Sin permisos nuevos.
- Variables opcionales `EMAIL_TRANSPORT`, `EMAIL_FROM`, `EMAIL_OUTBOX_DIR`. Los enlaces usan el origen de `BETTER_AUTH_URL`.
- Cualquier módulo puede añadir eventos ampliando `NotificationEvent` y `planNotification`, y las restricciones `type`/`reference_type` con una migración.
- Las pruebas que eliminan usuarios o laboratorios sintéticos deben borrar antes sus notificaciones.
- Pendiente: adaptador SES y su configuración en AWS, programación del despacho, preferencias por categoría/canal (`notification_preferences`), push/PWA, recordatorios programados, retención y auditoría de notificaciones, y eventos de otros módulos (reservaciones, prácticas, inventario bajo, mantenimiento).

## Referencias SRS

§19.1–19.4, §22, §26, §27, §33.14, §34.1–34.2; RNF10. ADR 0003, 0005, 0006, 0014. Ver [arquitectura](../architecture/notifications.md).
