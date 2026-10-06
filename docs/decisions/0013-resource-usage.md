# 0013 — Uso efectivo con contexto académico o reservación

Estado: **Propuesta**

## Contexto

El responsable autorizó Usage I después de Attendance I el 6 de octubre de 2026. RF23 requiere uso de maquinaria por alumno/sesión cuando aplique; RF29, §16 y RB12 requieren recuperar usos previos sin inferir responsabilidad. Academic I y Reservations mantienen contextos distintos de uso real. El SRS no fija el ciclo temporal exacto ni la exclusividad del uso registrado.

## Decisión propuesta e implementada en este corte

ResourceUsage registra un usuario, un Resource, inicio real del servidor y fin opcional. Cada fila tiene exactamente uno de dos contextos: LabSession o Reservation. No crea Attendance ni Reservation, y esas entidades tampoco crean usos. Usar varios recursos se representa mediante registros individuales, sin un nuevo agregado UsageSession.

Contexto académico: participante autenticado, miembro activo, sesión open y Resource activo del Space. No exige asistencia previa ni infiere apertura por reloj. Contexto de reserva: creador autenticado, confirmed y tiempo actual dentro de [inicio, fin); Resource explícitamente reservado o cualquiera del espacio reservado exclusivamente. Revalida hora después de esperar todos los bloqueos. No acepta otros propietarios ni recursos externos.

Inicio explícito; finalizar sólo el uso propio, incluso si el contexto terminó o recurso se desactivó. Inicio y finalización producen eventos transaccionales con actor/origen/snapshot. Finalización repetida conserva el fin original. Un usuario sólo puede tener un uso activo por Resource. Inicio repetido en el mismo contexto devuelve ese uso; cambiar contexto con el recurso aún activo produce conflicto.

El registro no concede disponibilidad, no sustituye reservas ni promete exclusividad del Resource. Permite usos declarados de distintas personas sobre un recurso: no se inventa una política de operación individual de maquinaria. Intervalos ya terminados pueden coexistir; no se capturan tiempos arbitrarios desde cliente. Hace falta otra decisión para exclusividad operativa, registros retroactivos o correcciones administrativas.

Permisos usage.read (historial propio), usage.record (inicio/fin propios), usage.trace (historial del recurso del laboratorio). Consulta histórica conserva recursos inactivos y ordena por inicio e identidad. No incluye atribución de culpa, correlación automática con incidentes ni efectos de mantenimiento/inventario.

## Alternativas

- Derivar uso desde asistencia/reserva: confunde presencia e intención con operación efectiva.
- Exigir Attendance para cualquier uso: excluiría contexto de reservación sin sesión.
- Bloquear globalmente un Resource por uso: supone exclusividad operacional que el SRS no define.
- Crear UsageSession o relacionar InventoryItem: requiere agregación/custodia e identidades pendientes.

## Consecuencias

FKs compuestas impiden relaciones entre espacios; FK de participante protege identidad académica; CHECK XOR protege contexto único e intervalo finito. UNIQUE parcial protege uso activo por usuario/recurso. READ COMMITTED con autorización bloqueada; académico bloquea Practice → LabSession → Space → Resource; reserva Space → Reservation → asociación → Resource. Finalizar sólo bloquea la fila propia de uso, sin invertir el orden del contexto. Ninguna escritura depende del resultado previo de options.

Estas políticas concretas son propuestas de implementación, no decisiones institucionales aprobadas. Mantener Propuesta hasta ratificación explícita. Pendientes: caducidad automática, corrección del historial con evidencia, cierre por personal de cuentas desactivadas, exclusividad de operación, paginación y consumo por Incidents. No implementar Incidents ni Maintenance en este corte.

## Referencias SRS

RF23, RF29; RNF3–5, RNF8–9, RNF11–12; §§16, 23–25, 30–31; RB11–12; ADR 0006, 0009, 0011 y 0012. El SRS no se modifica.
