# 0011 — Prácticas, sesiones y participación académica

Estado: **Propuesta**

## Contexto

El responsable seleccionó Academic I de la propuesta compartida tras Inventory I: prácticas y sesiones pequeñas como base para Usage I y futuras incidencias trazables. [SRS](../srs/PoliLabs-SRS.tex) RF2, RF4, RF23, RF29, §§16–17, RB1, RB11–12 y ADR 0006 distinguen actividad académica, reservación y uso real. La selección del módulo está autorizada; el SRS no define ciclos concretos, elegibilidad docente ni todos los permisos y restricciones académicas.

## Decisión propuesta

Mantener Practice y LabSession separados de Reservation y del futuro ResourceUsage. Modelar participantes mediante usuarios miembros del laboratorio, sin duplicar identidades ni equiparar inscripción a asistencia. Usar FKs compuestas para relaciones del mismo laboratorio, intervalos timestamptz finitos y participación única.

Implementar inicialmente `academic.read` (prácticas publicadas/sesiones propias) y `academic.manage` (gestión y consulta administrativa). Añadirlos sólo al responsable inicial; los demás roles se asignarán por el mecanismo autorizado de identidad. El responsable docente debe tener membresía activa y permiso de gestión académica. Este criterio no acredita condición institucional docente.

Prácticas draft/published/closed, sesiones scheduled/open/closed/cancelled. Editar sesión y participantes sólo antes de apertura; cerrar práctica sólo sin sesiones pendientes. Proteger registros propios aunque se acumulen roles: impedir autoinscripción y gestión de sesiones propias como participante, incluyendo cambios en su práctica. Reautorizar y revalidar relaciones bajo transacción; serializar escrituras por Practice y luego LabSession. Guardar actor, origen y snapshots atómicos en eventos del módulo.

No conectar automáticamente sesiones a disponibilidad ni registrar uso efectivo. Mantener America/Mexico_City en interfaz y aceptar instantes con offset en servicios. No introducir grupos, periodos, asistencia, requisitos temporales institucionales ni cupos en este corte.

## Alternativas

- Empezar Incidents aislado: registra fallas, pero no resuelve trazabilidad de uso efectivo entre contextos.
- Fusionar reservación, práctica y préstamo: mezcla permiso temporal, actividad y custodia; no demuestra uso real.
- Implementar Academic completo: amplía el frente hacia grupos, periodos y asistencia fuera del incremento solicitado.
- Crear ResourceUsage ahora: sería el siguiente incremento, con reglas propias aún pendientes.
- Conceder gestión sin restricciones por participación: permitiría a alumno/ayudante modificar registros académicos propios, en conflicto con ADR 0006.

## Consecuencias

Academic I funciona como corte independiente y conserva la identidad espacial existente. Las sesiones no bloquean reservas: integrar programación y disponibilidad requiere aprobación futura. Participantes previstos tampoco prueban uso real o responsabilidad sobre daños.

Las políticas concretas implementadas quedan propuestas para revisión del responsable; no se califican como decisiones institucionales aceptadas. Quedan pendientes consulta histórica por alumnos, delegación docente, inscripción/autoinscripción, cambios después de apertura, reapertura, asistencia, grupos/periodos y vínculo con reservaciones. Ver [arquitectura y validación](../architecture/academic.md).

## Referencias SRS

RF2–4, RF23, RF29; RNF3–9; §§16–17, 23–25, 30–31; RB1, RB11–12. El original no se edita.
