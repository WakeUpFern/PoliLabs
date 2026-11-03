# Decisiones arquitectónicas

Aceptada no implica implementada. Las decisiones iniciales se fundamentan en el SRS o en las instrucciones explícitas de esta sesión; las propuestas requieren evaluación.

- [0001 — Monolito modular y stack web](0001-modular-monolith.md): Aceptada.
- [0002 — PostgreSQL autoritativo y Drizzle](0002-postgresql-drizzle.md): Aceptada.
- [0003 — Servicios de aplicación compartidos por web e IA](0003-application-services.md): Aceptada.
- [0004 — Identidad desacoplada de permisos de negocio](0004-identity-permissions.md): Aceptada.
- [0005 — Archivos externos y adaptadores de integración](0005-external-adapters.md): Aceptada.
- [0006 — Alcance organizacional y membresías de laboratorio](0006-laboratory-scope.md): Aceptada.
- [0007 — Ubicación canónica del SRS](0007-canonical-srs-location.md): Aceptada.
- [0008 — Autenticación local con Better Auth](0008-local-authentication.md): Aceptada.
- [0009 — Reservaciones individuales y exclusividad por espacio](0009-individual-reservations.md): Aceptada; implementación actual de Reservations I aprobada explícitamente.

- [0010 — Inventario por cantidad y movimientos trazables](0010-quantity-inventory.md): Aceptada; alcance de Inventory I aprobado explícitamente.

- [0011 — Prácticas, sesiones y participación académica](0011-academic-sessions.md): Aceptada; Academic I y sus políticas concretas aprobados explícitamente el 6 de octubre de 2026.

- [0012 — Asistencia contextual y correcciones trazables](0012-attendance-checkin.md): Aceptada; incremento y políticas concretas aprobados explícitamente el 7 de octubre de 2026.
- [0013 — Uso efectivo con contexto académico o reservación](0013-resource-usage.md): Aceptada; incremento y políticas concretas aprobados explícitamente el 7 de octubre de 2026.

- [0014 — Incidencias operativas y trazabilidad contextual](0014-operational-incidents.md): Aceptada; Incidents I y sus políticas concretas aprobados explícitamente el 7 de octubre de 2026.
- [0015 — Bitácora de mantenimiento y estado operativo de recursos](0015-maintenance-logs.md): Aceptada; Maintenance I y las decisiones D1–D6 aprobados explícitamente el 7 de octubre de 2026.
- [0016 — Documentos, almacenamiento de objetos y evidencia de mantenimiento](0016-documents-object-storage.md): Aceptada; Documents I aprobado explícitamente el 7 de octubre de 2026 con subida por route handler y EXIF como pendiente.
- [0017 — Préstamos temporales de herramientas reutilizables](0017-tool-loans.md): Aceptada; Loans I y las decisiones D1–D5 aprobados explícitamente el 7 de octubre de 2026.
- [0018 — Reportes exportables en CSV y PDF](0018-exportable-reports.md): Aceptada; Reports I y las decisiones D1–D7 aprobados explícitamente el 7 de octubre de 2026.
- [0019 — Notificaciones in-app y correo transaccional mediante outbox](0019-notifications-email.md): Propuesta; Notifications I implementado, pendiente de aprobación explícita.
- [0020 — Planos de espacios y calendario de ocupación](0020-floor-plans-calendar.md): Propuesta; Spatial III y Reservations III implementados, pendiente de aprobación explícita (amplía la lectura de ocupación del ADR 0009).
- [0021 — Reservación interactiva desde la cuadrícula del calendario](0021-interactive-reservation-grid.md): Propuesta; Reservations IV implementado, pendiente de aprobación explícita (Reservaciones abre en una cuadrícula para reservar por arrastre o toque).
- [0022 — Personas del laboratorio, catálogo de roles y navegación guiada](0022-laboratory-people-and-guided-navigation.md): Propuesta; implementado para el arranque con el profesor encargado, pendiente de aprobación explícita (roles responsable/profesor/alumno, alta con contraseña temporal, pestañas y menú lateral al estilo de GitHub, inicio como tablero).
- [0023 — Navegación única por tamaño de pantalla y paleta institucional](0023-single-navigation-and-institutional-palette.md): Aceptada el 3 de noviembre de 2026; reemplaza la D7 del ADR 0022 (barra lateral agrupada en escritorio, barra inferior por permisos en celular, cuenta en el avatar, paleta IPN/UPIITA y botones unificados).
- [0024 — Despliegue inicial en Vercel con Postgres administrado y documentos en S3](0024-vercel-deployment.md): Propuesta; implementado para el arranque con el profesor encargado, pendiente de aprobación explícita (adaptador S3, documentos de 4 MB, pool de 1 conexión en Vercel, cron diario de limpieza, correo apagado al inicio).
