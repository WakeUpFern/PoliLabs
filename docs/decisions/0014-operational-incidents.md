# 0014 — Incidencias operativas y trazabilidad contextual

Estado: **Aceptada**

## Contexto

El responsable autorizó Incidents I el 7 de octubre de 2026, incluyendo los ajustes revisados: Resource, Space o LabSession como objetivo; Usage opcional; contexto espacial conservado; usos relevantes sin identificar un culpable; permisos separados y ciclo open → in_review → resolved. ADR 0012/0013 ya están aceptadas. RF28–29, §16 y RB11–12 sustentan reporte, clasificación, seguimiento, resolución y trazabilidad. El SRS no fija severidades, matriz exacta de permisos ni elegibilidad detallada del vínculo de uso.

## Decisión

Un único IncidentReport pertenece a Laboratory y conserva Space obligatorio como relación contextual protegida. targetKind distingue exactamente un objetivo afectado: recurso, espacio o sesión. Resource y LabSession tienen FKs compuestas del mismo Space, y Space del mismo Laboratory. Para un objetivo Resource, la sesión o reservación de un Usage vinculado son contexto, no objetivos adicionales.

Descripción obligatoria hasta 5000 caracteres y severidad low/medium/high. Identidad autenticada y hora del servidor. El reporte no requiere clase, reserva, asistencia ni uso. Resource y Space deben estar activos en el catálogo al reportar. Una sesión conocida puede estar scheduled/open/closed/cancelled; un participante propio puede reportar si la práctica no es borrador, y academic.manage permite objetivos de sesión del laboratorio. No se concede acceso a todos los datos académicos por incident.create.

Usage opcional, sólo para objetivo Resource y uso propio todavía abierto al guardar; debe corresponder al recurso y Space. Si finaliza mientras se llena el formulario, se rechaza el vínculo y puede enviarse el reporte sin él. Esta asociación no añade nuevas formas de iniciar Usage: ADR 0013 sigue limitando su creación a sesión o reservación. No se inventa un contexto para hallazgos independientes.

Conservar snapshot de nombre del objetivo, Space y Location asignada al recurso al reportar. Es contexto del catálogo capturado, no prueba del sitio o momento del daño ni reconstrucción de la ubicación durante usos previos. No cambiar el objetivo, descripción o clasificación después del reporte en este corte.

Ciclo open → in_review → resolved; cada transición requiere nota, versión esperada, actor y origen. La resolución conserva nota y fecha. Sin saltos, reapertura ni cierre adicional redundante; no hay borrado público. Un gestor puede resolver un reporte propio: no se traslada a incidencias la restricción académica de gestionar asistencia propia. El SRS no define esa prohibición operativa.

Permisos incident.create, incident.read (propios), incident.review (laboratorio) e incident.resolve (transiciones). Resolución no concede lectura global; los permisos se asignan separadamente. Consulta de usos de otras personas requiere además usage.trace. No hay roles institucionales hardcodeados; migración y bootstrap asignan los cuatro permisos al responsable inicial. Reportar no concede gestión.

Trazabilidad: usos del mismo recurso iniciados antes o al reportar, ordenados por inicio e identidad, excluyendo el uso asociado que se presenta aparte. Mostrar hasta 50 usos recientes y avisar si hay más. Incluye intervalos solapados y abiertos al reportar; distingue fin posterior al reporte. No persistir previousUserId ni inferir causalidad, culpabilidad o exclusividad. La hora de reporte no equivale a fecha de ocurrencia.

## Alternativas

- Exigir Practice, Reservation o Usage: impide hallazgos fuera de una actividad.
- Objetivo sólo Resource/Space: omite las incidencias de sesión previstas por §16 y RB11.
- Un único “usuario anterior”: es ambiguo con usos simultáneos y no acredita responsabilidad.
- Derivar ubicación histórica del catálogo actual: pierde contexto al mover o renombrar equipos.
- Bloquear/cancelar/crear mantenimiento automáticamente: §16 reserva esa decisión al personal autorizado y requiere un incremento explícito.

## Consecuencias

Dos tablas nuevas y cuatro permisos; único índice compuesto adicional en ResourceUsage para proteger el vínculo. Eventos transaccionales inmutables ante UPDATE con snapshots antes/después. READ COMMITTED y autorización bloqueada; reportar sesión sigue Practice → LabSession → Space, recurso Space → Resource → Location → Usage. Finalizar Usage sólo bloquea su fila; el bloqueo SHARE del reporte serializa la asociación con el fin. Transiciones bloquean sólo la incidencia, con versión optimista para conflictos concurrentes.

Las políticas concretas descritas quedan aceptadas como decisiones del proyecto mediante aprobación explícita del responsable el 7 de octubre de 2026; no se presentan como requisitos institucionales del SRS. Pendientes: clasificación editable, notas adicionales sin transición, reapertura, adjuntos, reportes/exportaciones, fecha de detección con evidencia, objetivos desactivados, paginación, bloqueos de disponibilidad y Maintenance. No se modifica el SRS ni se aprovisiona infraestructura.

## Referencias SRS

RF28–29; RNF3–9; §§16, 23–25, 30–31; RB11–12; ADR 0004, 0006, 0011–0013. Ver [arquitectura](../architecture/incidents.md).

## Historial

El ADR se registró inicialmente como Propuesta durante la implementación de Incidents I. El 7 de octubre de 2026, el responsable aprobó explícitamente el ADR 0014 y sus políticas concretas. Se actualiza a Aceptada sin ampliar su alcance ni aprobar los incrementos pendientes.
