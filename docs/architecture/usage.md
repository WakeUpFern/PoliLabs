# Usage I

## Alcance y modelo

Segundo corte autorizado después de Attendance I. Registrar inicio/fin de uso real de un Resource con contexto de LabSession o Reservation validado. RF23, RF29, §16 y RB12 sustentan el flujo; [ADR 0013](../decisions/0013-resource-usage.md) registra las políticas detalladas aceptadas explícitamente el 7 de octubre de 2026.

`resource_usage`: id, userId, resourceId, spaceId, sessionId nullable, reservationId nullable, startedAt, endedAt nullable, createdAt. Laboratory se deriva de Space; FKs compuestas conservan Resource/contexto del mismo Space y participación académica. Exactamente un contexto mediante CHECK XOR; instantes finitos, fin >= inicio. UNIQUE parcial por usuario/recurso con fin nulo. `usage_events`: actor, origen y snapshot de inicio/finalización, sin UPDATE público ni borrado en servicios.

## Servicios y autorización

UsageService ofrece options, start, finish, mine y trace. No depende de React/HTTP/Drizzle/IA. AuthorizationService exige usage.record para propios, usage.read para historial propio y usage.trace para historial del recurso dentro del laboratorio. Permisos se añaden al responsable inicial por migración/bootstrap; otros usuarios requieren roles autorizados. Usuarios/recursos se identifican mediante sus cuentas y catálogo existentes.

Academic: sesión open, alumno participante activo y Resource activo de su Space. Reservation: creador propio, confirmed, tiempo real dentro de [inicio,fin), recurso asociado o recurso del espacio exclusivo. Los candidatos ya vienen filtrados, pero start revalida todo bajo transacción. No exige Attendance y no la crea. No conecta inventario ni atribuye culpa.

Inicio y fin siempre explícitos con reloj del servidor, sin tiempos enviados por cliente. Inicio repetido devuelve el uso aún activo del mismo contexto. Un contexto diferente sobre el mismo recurso activo produce conflicto. Finalización propia repetida conserva el fin original; se permite terminar después de cierre, expiración o desactivación del recurso. Una membresía/identidad revocada sigue sin poder escribir: recuperación por personal queda pendiente. No crea una reserva ni bloquea disponibilidad automáticamente.

## Web e historial

`/app/labs/[slug]/usage`: selección explícita de recurso/contexto autorizado, inicio, historial propio y terminar uso. Etiquetas del historial proceden de entidades persistentes actuales, aun desactivadas; no son snapshots de sus nombres. `/usage/resources/[resourceId]`: historial por recurso sólo con usage.trace, accesible desde el catálogo para personal; muestra usuario, inicio/fin y contexto. No muestra interpretación de culpabilidad.

La vista de asistencia conserva su propósito académico. Puede accederse a Usage desde navegación o sesión, pero el formulario de Attendance no selecciona máquinas. Cada recurso usado tiene una fila; no hay UsageSession ni agregado multirrecurso nuevo.

## Persistencia, concurrencia y SQL

Transacciones READ COMMITTED con reautorización bloqueada hasta commit. Academic: Practice → LabSession → Space → Resource; Reservation: Space → Reservation → asociación → Resource, compatible con Reservations I. Hora de reserva se revalida al final de los bloqueos. UNIQUE parcial resuelve comienzos concurrentes del mismo usuario/recurso; finalización bloquea fila propia FOR UPDATE. Eventos y registros se persisten atómicamente. No hay lock global del laboratorio.

Migración `0008_usage_i.sql`: dos tablas (9 y 7 columnas), dos PK UUID, siete FKs RESTRICT, tres CHECK, UNIQUE parcial y tres índices auxiliares. Agrega tres permisos y sus asignaciones iniciales; una función y trigger impiden UPDATE de eventos. Sin DROP/TRUNCATE/DELETE, extensiones ni cambios sobre reservas, saldos o asistencias.

## Validación y pendientes

Pruebas `tests/usage.test.ts` y `tests/integration/usage.test.ts`: estados, propiedad, reservas futuras/canceladas/vigentes, recursos incluidos/exclusivos, identidad/origen servidor, independencia de Attendance, relaciones PostgreSQL, idempotencia y concurrencia inicio/fin/cierre. Base separada `_test` y fixtures sintéticas.

Pendientes: consultas paginadas, correcciones administrativas, exclusividad operacional, mecanismos de cierre de usos olvidados, consumo de trace por Incidents, Maintenance, préstamos e inventario individualizado. No convierte historial en prueba disciplinaria. Resultados finales en [validación](attendance-usage-validation.md).
