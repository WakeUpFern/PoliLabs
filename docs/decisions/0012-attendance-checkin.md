# 0012 — Asistencia contextual y correcciones trazables

Estado: **Aceptada**

## Contexto

El responsable autorizó implementar Attendance I y luego Usage I el 6 de octubre de 2026. RF5, §17.3 y RB1 requieren asistencia habilitada, hora, estado y correcciones autorizadas. Academic I ya separa participantes previstos de asistencia y ADR 0011 define apertura manual y restricciones de gestión propia. El SRS no prescribe QR, taxonomía de estados ni política detallada de corrección histórica.

## Decisión

Attendance pertenece a Academic conceptualmente y se organiza como módulo concreto para aislar sus servicios, permisos y eventos. Una fila por usuario/sesión; FK al participante, sesión/espacio y ubicación/espacio. Space se repite para proteger la Location mediante FKs compuestas; Laboratory se deriva de la sesión.

El alumno confirma explícitamente su registro, sólo como participante activo en sesión open; el reloj no abre sesiones. El deep-link estable `/check-in/[slug]/[locationId]` preserva su destino al login y resuelve sólo sesiones abiertas propias del espacio. Sin candidatos no registra; uno se preselecciona; varios requieren elección. La identidad y el origen proceden del servidor. El QR físico puede codificar el enlace, pero su generación visual e impresión se posponen. Abrir un enlace nunca acredita presencia ni produce escrituras.

Estados present/late/absent, sin cálculos de retardo ni ausencias automáticas. La autocaptura produce present. El personal registra sólo en open y requiere motivo; ausencia inicial tiene checkInAt nulo. La hora de una captura manual presente/retardo es la hora de registro, no una reconstrucción retroactiva de llegada. Corregir conserva esa hora y ubicación originales, incrementa versión y registra actor, origen, motivo y snapshots antes/después. Present/late corregido desde ausencia puede conservar hora nula: estado y evidencia de check-in son independientes.

No crear asistencias nuevas en closed/cancelled (RB1). Corrección de filas existentes en open/closed; cancelled conserva historia sin admitir correcciones en este corte. El alumno puede obtener su constancia existente tras cierre, sin crear ni modificar. El gestor que participa en la sesión puede consultar el padrón, pero no registrar/corregir a nadie en esa sesión; interviene otro gestor, siguiendo ADR 0011.

Permisos attendance.read (propio), attendance.checkin (propio), attendance.manage (padrón, eventos, gestión). Participación no concede permiso. Nuevos permisos se asignan al responsable inicial por migración y bootstrap; otros roles requieren administración autorizada existente.

## Alternativas

- Abrir por horario: contradice apertura manual de Academic I.
- QR dinámico o geolocalización: amplía alcance y no está exigido por el SRS.
- Alta retroactiva en sesiones cerradas: requiere resolver expresamente RB1 antes de ampliar el flujo.
- Usar academic_events para asistencia: mezcla responsabilidades y complica evolucionar cada historial.

## Consecuencias

Transacciones READ COMMITTED, autorización bloqueada hasta commit y orden Practice → LabSession → Space → Location/participante. La sesión serializa check-in/cierre y correcciones. UNIQUE protege duplicados; expectedVersion rechaza correcciones basadas en una versión obsoleta. Eventos no admiten UPDATE; no hay API de borrado. No sustituye Audit global.

Las políticas concretas de Attendance I quedan aceptadas como decisiones del proyecto mediante aprobación explícita del responsable el 7 de octubre de 2026. No se presentan como requisitos institucionales adicionales del SRS. Pendientes: taxonomía institucional, QR imprimible, edición del tiempo de llegada con evidencia y correcciones sobre cancelaciones.

## Referencias SRS

RF1, RF5, RNF3–5, RNF8–9, RNF11–12; §§17.3, 23–25, 33–34; RB1; ADR 0006 y 0011. El SRS original se conserva.

## Historial

El ADR se registró inicialmente como Propuesta durante la implementación. El 7 de octubre de 2026, el responsable aprobó explícitamente los ADR 0012 y 0013 y sus políticas concretas. Se actualiza a Aceptada sin ampliar el alcance ni aprobar las ampliaciones pendientes.
