# Academic I — prácticas, sesiones y participantes

## Alcance seleccionado

El responsable seleccionó el siguiente incremento de la propuesta compartida: Academic I, seguido posteriormente por Usage I. Se implementan prácticas con título e instrucciones; sesiones con práctica, espacio, responsable docente, intervalo y estado; y participantes previstos. SRS RF2, RF4, §§17.1–17.2, RNF3–9 y ADR 0006 sustentan este corte. El SRS original permanece intacto.

No se implementan grupos/periodos (RF3), asistencia (RF5), uso efectivo de maquinaria (RF23), préstamos, incidencias, mantenimiento, documentos o notificaciones. Una inscripción no concede roles ni acredita asistencia o uso. Una sesión no es una reservación; no modifica disponibilidad ni promete exclusividad. Se podrán programar sesiones coincidentes; la disponibilidad se gestiona por los servicios de Reservations y su integración académica requiere otro incremento.

## Modelo y servicios

`Practice` pertenece a Laboratory. `LabSession` referencia Practice, Space y responsable del mismo laboratorio. `SessionParticipant` identifica una cuenta interna miembro de ese laboratorio; no se crea un segundo alumno ni se presume integración institucional. PostgreSQL protege estas relaciones con FKs compuestas, intervalos finitos positivos y unicidad de participante por sesión. El índice compuesto de Space permite esa FK sin duplicar su identidad.

`AcademicService` contiene los casos de uso y reglas, reutilizable por web y futuras herramientas. El dominio no importa React, Next.js, Drizzle ni módulos operativos. `DrizzleAcademicStore` coordina transacciones READ COMMITTED y reautoriza mediante AuthorizationService con filas de actor, laboratorio, membresía y ruta de permiso bloqueadas en SHARE hasta commit. Responsable, participantes y espacio activos se revalidan y bloquean para creación, edición e inicio. Las revocaciones posteriores no borran el historial.

Todas las escrituras bloquean primero Practice; las modificaciones de una sesión bloquean luego LabSession. Así se serializan cierre de práctica, creación/apertura de sesiones y reemplazos de participantes. No se aplican bloqueos de Reservations porque este flujo no asigna disponibilidad. Las transiciones y elegibilidad operativa se protegen en servicios; las restricciones PostgreSQL protegen formato, intervalos, unicidad y relaciones incluso ante SQL directo. No se afirma que SQL directo aplique toda la política académica.

Cada cambio persiste `academic_events` con actor autenticado, origen WEB/API/AGENT/SYSTEM y snapshot en la misma transacción. Reemplazar participantes conserva filas sin cambio y registra antes/después. Los eventos no admiten UPDATE; no existe borrado público. Esto no sustituye el futuro módulo global Audit.

## Política inicial de implementación

Las decisiones concretas que el SRS deja abiertas siguen **Propuestas** en [ADR 0011](../decisions/0011-academic-sessions.md), sin presentarlas como política institucional aceptada:

- `academic.read`: prácticas publicadas; sesiones propias por participación. `academic.manage`: acceso a borradores, prácticas cerradas y listas de participantes; escritura académica. La migración incorpora ambos al rol inicial `laboratory_responsible`, siguiendo el bootstrap vigente. No se inventan roles profesor/alumno ni se modifica delegación. Las cuentas de alumno necesitan una membresía con `laboratory.read` y `academic.read` asignados por la administración autorizada.
- El responsable docente debe ser usuario y miembro activo con `academic.manage`. Esto representa elegibilidad administrativa de este corte, no acredita condición institucional de profesor.
- Prácticas: draft → published → closed; no reapertura. Se pueden editar borradores/publicadas. Crear sesión requiere práctica publicada; cerrar práctica requiere todas sus sesiones cerradas/canceladas.
- Sesiones: scheduled → open → closed; scheduled/open → cancelled. Horario y participantes sólo se editan en scheduled. Apertura manual; no se infiere ejecución por reloj ni asistencia al abrirla.
- Toda gestión de una sesión se deniega si el actor está inscrito en ella. Tampoco puede autoinscribirse, retirar su propia inscripción ni editar/cerrar la práctica de una sesión propia, aunque combine permisos de alumno y ayudante. Otro responsable puede gestionar esos registros.
- Instantes con offset y timestamptz; UI America/Mexico_City. No se exige inicio futuro ni se impide capturar sesiones pasadas: el SRS no define esa restricción. La política de calendarios, horarios, cupos y configuración por laboratorio queda pendiente.

Los alumnos no reciben el padrón de sus compañeros ni catálogos de cuentas. Participación y autorización siguen siendo relaciones independientes. Las sesiones históricas se conservan al cerrar una práctica, consultables por administración; la política de consulta de prácticas cerradas por alumnos queda pendiente.

## Web y validación

Rutas `/app/labs/[slug]/academic`, `/practices/new`, `/practices/[practiceId]` y `/sessions/[sessionId]`. Páginas servidor y Server Actions; formularios con estado de envío, feedback de validación, confirmación de cierre/cancelación y conservación de entradas ante errores. Actor y origen se resuelven en servidor, sin aceptar esos campos del cliente. Errores de acceso e identificadores ajenos se muestran como no disponible; errores inesperados llegan al boundary.

Migración `0006_academic_i.sql`: cuatro tablas, restricciones, índice de Space, catálogo de permisos y protección de eventos. Se revisaron y ordenaron los índices únicos antes de las FKs que los usan. No modifica existencias ni reservaciones. Aplicar sólo mediante migraciones versionadas; nunca schema push. La migración revisada se aplicó correctamente tanto a la base aislada de pruebas como a la base local de desarrollo configurada, mediante `pnpm db:migrate`.

Validación ejecutada con Node.js 24.21.0:

- `pnpm check`: lint, TypeScript, 39 pruebas unitarias y formato.
- `pnpm build`: compilación de producción y generación de las rutas académicas.
- `pnpm test:integration`: 91 pruebas aprobadas contra la base PostgreSQL aislada `_test`, sin omitir pruebas. Incluyen creación atómica, relaciones cruzadas, permisos revocados, alumno/gestor simultáneo, participantes duplicados, auditoría y concurrencia de apertura/cierre/creación y reemplazo de participantes. También cubren regresiones de Identity, Spatial, Reservations e Inventory.
- Recorrido E2E manual en navegador integrado contra producción local y cuentas sintéticas: login de responsable, navegación, creación de borrador, publicación, horario inválido con conservación de campos, creación con participantes, edición, apertura, login de alumno y consulta sin padrón/controles administrativos; volver sin confirmar cancelación; cierre de sesión, cancelación de segunda sesión y cierre de práctica conservando ambas sesiones. Sin errores o advertencias registrados en consola. La confirmación se realiza dentro del formulario; se eliminó el diálogo nativo tras detectar un bloqueo del navegador integrado.

Fixture reproducible: ejecutar `pnpm build` y luego `pnpm exec tsx tests/e2e/academic-browser-fixture.ts`. Inicia producción en `localhost:3107` únicamente contra una base `_test`, crea cuentas `invalid.test`, laboratorio, espacio y una sesión de muestra. Imprime sólo las credenciales sintéticas y rutas. Detener con SIGINT/SIGTERM limpia exclusivamente esos fixtures. No ejecutar simultáneamente con la suite de integración: la prueba de esquema de autenticación espera tablas de cuentas sin fixtures. Ver [guion E2E](../../tests/e2e/academic-browser.md).

La automatización de pruebas de navegador no está instalada: el recorrido E2E se ejecutó mediante el navegador integrado, no mediante una suite Playwright persistente. `agent-browser` no estaba disponible. Las comprobaciones de horario contemplan la zona inicial y cambios históricos de offset; configuración por laboratorio queda fuera del corte.

## Próximo puente operativo

Usage I deberá registrar quién utilizó realmente un Resource e intervalo efectivo con contexto de Reservation o LabSession verificado, manteniendo identidades separadas. Incidents consumirá esa trazabilidad para localizar usos previos, sin inferir culpa (RF29, §16, RB12). Este incremento prepara LabSession y participantes; no crea tablas anticipadas de Usage ni enlaces ficticios a préstamos de inventario por cantidad.
