# Attendance I

## Objetivo y modelo

Flujo seleccionado después de Academic I, antes de Usage I. Implementa RF5 y §17.3, con reglas concretas aceptadas el 7 de octubre de 2026 en [ADR 0012](../decisions/0012-attendance-checkin.md). SessionParticipant representa participación prevista, Attendance constancia de asistencia y ResourceUsage operación efectiva. Ninguno crea automáticamente a otro.

`attendance`: id, sessionId, userId, spaceId, checkInAt nullable, locationId nullable, status, recordedBy, version, createdAt, updatedAt. Laboratory se deriva de LabSession; spaceId permite FKs de sesión y Location del mismo espacio. UNIQUE(session_id,user_id) y FK al participante protegen unicidad y relaciones. `attendance_events` guarda actor, source, acción, motivo y snapshot antes/después; inmutable ante UPDATE. Sin servicio de borrado ni Audit global.

## Resolución y experiencia

Deep-link estable `/check-in/[slug]/[locationId]`, visible por Location en el catálogo. Entrada sin autenticación redirige al login preservando sólo destinos seguros bajo `/app`. Después del login llega a `/app/labs/[slug]/attendance?location=...`. La generación visual/imprimible de QR queda pendiente; cualquier QR físico puede codificar ese enlace sin secretos.

Resolve busca sesiones del laboratorio, Practice publicada, LabSession open, Space activo, participación propia y, si hay Location, mismo Space activo de la ubicación activa. Horario sirve para mostrar y ordenar, no para abrir. Cero: explicación sin registro; uno: preselección; múltiples: selector explícito entre candidatos autorizados. Sin Location se accede al mismo servicio desde la sesión/navegación.

El POST reautoriza y valida de nuevo sesión, participación, actividad y Location. Actor no editable y source WEB resuelto en servidor. Abrir URL nunca escribe. QR identifica contexto y no demuestra presencia física. El alumno confirma present; repeticiones devuelven la fila y hora original, incluso como consulta idempotente tras cierre. La ubicación proporcionada debe seguir siendo válida.

## Gestión y estados

Permisos attendance.read, attendance.checkin, attendance.manage. Propio no revela padrón. Personal autorizado consulta participantes, estado, hora, nombre de Location y eventos con actor/motivo. Alta manual sólo open, motivo obligatorio; absent no inventa checkInAt. Corrección sólo filas existentes en open/closed, nunca scheduled/cancelled; conserva hora/Location, incrementa versión. No calcular retardo ni generar ausencias. Un gestor participante no puede gestionar ninguna asistencia de esa sesión. Historial se conserva al cerrar/cancelar, aunque práctica, usuario o catálogo se desactiven.

## Transacciones y SQL revisado

AuthorizationService con ruta de autorización bloqueada en SHARE; operaciones usan READ COMMITTED. Mutaciones/consulta de padrón bloquean Practice y luego LabSession. Escrituras validan Space, Location y participantes activos bajo SHARE. Cierre de sesión y cambios de participantes usan el mismo orden de Academic I. UNIQUE protege dos confirmaciones y expectedVersion rechaza correcciones simultáneas sobre la misma versión.

Migración `0007_attendance_i.sql`: dos tablas (11 y 8 columnas), dos PK UUID, UNIQUE de asistencia, dos índices auxiliares y un UNIQUE adicional `(id,space_id)` de LabSession; seis FKs RESTRICT, cuatro CHECK, tres permisos y asignación al responsable inicial. El índice de LabSession se ordenó antes de la FK que lo utiliza. Una función PL/pgSQL y un trigger rechazan UPDATE sobre eventos. No DROP/TRUNCATE/DELETE, extensiones ni modificación de filas académicas. Sólo se añaden índice y permisos a tablas existentes; las migraciones anteriores no se reescriben.

## Validación y límites

Ver pruebas `tests/attendance.test.ts`, `tests/integration/attendance.test.ts` y fixture compartida `tests/integration/operation-fixture.ts`. Incluyen estados, preselección, identidad de servidor, contexto manipulado, permisos, roles acumulados, correcciones, UNIQUE/FK y carreras check-in/cierre y correcciones. La base de integración termina en `_test`; no usa datos personales reales.

Pendientes: QR visual/imprimible, taxonomía institucional aprobada, edición de hora real con evidencia, padrón paginado, reportes y Audit global. Las políticas concretas del ADR están aceptadas como decisiones del proyecto. Resultados finales de comandos y navegador se registran en [validación de ambos incrementos](attendance-usage-validation.md).
