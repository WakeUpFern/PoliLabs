# Incidents I

## Alcance y modelo

Incidents I fue autorizado el 7 de octubre de 2026 tras Attendance I y Usage I. Reportar, clasificar, seguir y resolver anomalías del mismo laboratorio, dentro o fuera de clase. SRS RF28–29, §16 y RB11–12. Las decisiones concretas están Aceptadas en [ADR 0014](../decisions/0014-operational-incidents.md) mediante aprobación explícita del responsable el 7 de octubre de 2026, junto con ADR 0012/0013.

`incident_reports`: Laboratory, targetKind, Space contextual obligatorio, Resource o LabSession según objetivo, Usage opcional, autor, descripción, severidad, estado, snapshot espacial, resolución, versión y fechas. Resource/Space/Session son los tres objetivos posibles; no se duplican incidencias por procedencia académica o reservación. FK Space–Laboratory, Resource–Space, Session–Space y Usage–Resource–Space protegen redundancias. El laboratorio no procede de una ubicación opcional.

Resource/Space activos en el catálogo. Sesiones propias por participación (práctica no borrador), o cualquier sesión del laboratorio para academic.manage, con reautorización adicional. El estado/horario de la sesión no bloquea reportar una anomalía: esto no crea asistencia ni abre sesiones. Una persona autorizada puede reportar un equipo que no utiliza, sin crear Usage.

Snapshot conserva nombre del objetivo, espacio y ubicación asignada al equipo al reportar, aunque se mueva o renombre. No acredita lugar o momento de la falla ni ubicación de usos anteriores. Usuarios y actores conservan UUID real; se muestran sus nombres actuales.

## Flujo web y permisos

`/app/labs/[slug]/incidents`: propios; `?scope=laboratory`: revisión autorizada. `/incidents/new`: selección de objetivo, Usage propio opcional, descripción y severidad. `/incidents/[incidentId]`: detalle, historial y gestión según permiso. Entradas desde laboratorio, catálogo Resource/Space, sesión y usos activos. Desde Usage se preselecciona recurso/uso, pero siempre se vuelven a validar los IDs.

Permisos independientes incident.create/read/review/resolve; cuatro permisos migrados al responsable inicial y reutilizados por bootstrap. Otros miembros necesitan asignación autorizada; participación no concede permisos. Lectura propia no revela reportes de otros usuarios. incident.resolve admite gestionar un reporte propio, sin reglas institucionales inventadas. Lecturas históricas y resolución siguen disponibles después de desactivar el objetivo o cerrar la sesión, mientras actor, membresía y laboratorio continúen activos.

El servidor obtiene actor y source WEB; campos cliente reportedBy/source no se usan. Abrir URL no escribe. Formularios preservan los datos tras error, deshabilitan durante guardado y muestran feedback; tras reportar se ofrece detalle. Transiciones muestran la versión del registro y requieren nota.

## Uso asociado y trazabilidad

Usage es opcional y nunca requisito para reportar. Si se aporta, debe ser propio, del mismo recurso/Space y seguir abierto al guardar. Puede provenir de LabSession o Reservation. El reporte bloquea esa fila en SHARE hasta commit para evitar asociar un uso que finalizó antes del registro. El fin posterior conserva la asociación.

Revisión de usos ajenos requiere incident.review y usage.trace, ambos revalidados dentro de la transacción. Consulta del mismo recurso anterior o simultánea al instante del reporte; no incluye inicios posteriores. El uso asociado se muestra aparte. Hasta 50 usos previos recientes, con aviso de historial adicional. Incluye varios usuarios, solapamientos y usos abiertos al reportar; no identifica “sospechoso”, no acredita completitud del historial y no equipara reporte a ocurrencia.

## Estados, transacciones y migración

open → in_review → resolved. Severidad inicial low/medium/high; descripción y notas 1–5000 caracteres. Sin salto directo, repetición de transición ni reapertura. Nota obligatoria de revisión y de resolución; esta última persiste en el reporte con resolvedAt. Eventos guardan actor, origen, nota y snapshots antes/después; trigger impide UPDATE, no existe API de borrado.

AuthorizationService y helper authorizeLocked en READ COMMITTED. Reporte de sesión conserva orden Practice → LabSession → Space; recurso Space → Resource → Location → Usage, todos en SHARE. Actualización de estado bloquea IncidentReport en UPDATE; expectedVersion rechaza una segunda transición concurrente sobre la versión anterior. Registro y evento se escriben en la misma transacción. Hora de creación/evento obtenida con clock_timestamp después de adquirir los locks, evitando que el inicio de la transacción adelante falsamente el reporte al uso asociado.

Migración `0009_incidents_i.sql`: dos tablas (17 y 8 columnas), siete FKs RESTRICT, nueve CHECK, cuatro índices nuevos y un UNIQUE adicional de Usage, cuatro permisos/asignaciones iniciales, una función y trigger contra UPDATE de eventos. El índice de Usage se ordenó antes de su FK dependiente. SQL revisado antes de aplicar: sin DROP/TRUNCATE/DELETE ni reescritura de migraciones previas. No se modifican reglas de Usage, saldos, reservas ni ciclos académicos.

## Validación y pendientes

Pruebas puras en `tests/incidents.test.ts`; integración PostgreSQL en `tests/integration/incidents.test.ts`, incluida concurrencia de gestores, asociación frente a fin de Usage, aislamiento y restricciones. Fixture web reproducible `tests/e2e/incidents-browser-fixture.ts`, sólo base `_test` e identidades sintéticas. Resultados ejecutados en [validación](incidents-validation.md).

No incluye adjuntos, edición del reporte, notas libres entre transiciones, reapertura, notificaciones, bloqueos de disponibilidad, cancelación de reservas, Maintenance, InventoryMovement, exportaciones, Giussepe ni AWS. No se introducen permisos automáticamente para alumnos ni uso independiente sin los contextos del ADR 0013. La integración futura de incidencias y estado operativo necesita decisión explícita del personal y otro incremento.
