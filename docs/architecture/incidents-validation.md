# Validación de Incidents I

Fecha: 7 de octubre de 2026. Node.js 24.19.0, pnpm y lockfile existente; sin dependencias ni variables nuevas. SRS original conservado. Se preservan los cambios previos de aceptación de ADR 0011–0013 presentes al comenzar.

## Entrega y alcance

Módulo `src/modules/incidents/`: dominio puro, IncidentService y contratos de aplicación, adaptadores PostgreSQL y web. Rutas de lista propia/revisión de laboratorio, alta y detalle/seguimiento. Entradas autorizadas desde laboratorio, Resource/Space, sesión y Usage. Resource, Space o LabSession como objetivo afectado; uso propio activo opcional. No crea asistencia, reservas, usos, bloqueos de disponibilidad ni mantenimiento.

Contexto espacial capturado en snapshot al reportar; lectura/resolución posterior conservan nombres/ubicación aunque el recurso cambie o se desactive. Severidad inicial low/medium/high; ciclo open → in_review → resolved y nota obligatoria en cada transición. Historial con actor, origen y snapshots atómicos; versión optimista frente a gestores concurrentes.

Consulta propia no expone reportes de otros usuarios. Revisión exige incident.review y consulta de usos ajenos exige además usage.trace. No se codifican roles alumno/profesor; cuatro permisos de Incidents se asignan al responsable inicial por migración/bootstrap, otras membresías requieren administración autorizada.

## SQL revisado y aplicado

`0009_incidents_i.sql` incorpora dos tablas (17/8 columnas), siete FKs RESTRICT, nueve CHECK, cuatro índices nuevos y un UNIQUE adicional `(id,resource_id,space_id)` de ResourceUsage. El índice se ordenó antes de la FK dependiente. Añade cuatro permisos y asignaciones al responsable inicial, una función y trigger que rechazan UPDATE de eventos. Snapshot y journal versionados; migraciones anteriores intactas.

Sin DROP/TRUNCATE/DELETE, schema push, extensiones ni cambios de estado, saldos o reglas previas. Aplicada primero a la base protegida `_test` mediante integración y después a PostgreSQL local de desarrollo con `pnpm db:migrate`.

## Comandos ejecutados

| Comprobación            | Resultado final                                                              |
| ----------------------- | ---------------------------------------------------------------------------- |
| `pnpm check`            | Correcto: ESLint, TypeScript, 47 pruebas unitarias/configuración y Prettier. |
| `pnpm test:integration` | Correcto: 127 resultados, cero fallos/omisiones, PostgreSQL real.            |
| `pnpm build`            | Correcto con Turbopack; incluye las tres rutas nuevas de Incidents.          |
| `pnpm db:migrate`       | Correcto; migración aditiva aplicada al desarrollo local.                    |
| `git diff --check`      | Correcto en revisión final.                                                  |

Incidents aporta tres pruebas puras y trece subpruebas PostgreSQL más su contenedora (14 resultados). Incluye Resource/Space sin contexto, sesiones por participación/gestión y estado independiente, asociación propia de Usage académico o reserva vigente fuera de clases, permisos separados, aislamiento entre usuarios/laboratorios, manipulación de actor/origen, snapshot ante movimiento/desactivación, ciclo/nota/resolución/versionado, eventos inmutables, dos gestores concurrentes y reporte frente a finalización de Usage. Trazabilidad cubre usos solapados, exclusión del asociado y de inicios posteriores al reporte, y permiso adicional. PostgreSQL rechaza relaciones cruzadas, objetivo inválido y resolución incompleta.

La primera conexión encontró PostgreSQL detenido; se inició el servicio Compose existente conservando su volumen. Las primeras fixtures corrigieron reservas que intentaban comenzar en el pasado y la inscripción del gestor en su propia sesión. La suite completa detectó que una prueba previa limpia el catálogo de permisos: la fixture compartida ahora prepara su catálogo explícitamente antes de crear datos. Se retiró exclusivamente el grupo sintético incompleto de `_test` con prefijo/UUID conocido y sin espacios/membresías. Formato de snapshot y fixture corregido antes de la ejecución final. No se atribuyen como aprobadas las ejecuciones fallidas.

## Recorrido web ejecutado

Producción en localhost:3108, exclusivamente contra `_test`, con fixture reproducible `tests/e2e/incidents-browser-fixture.ts` y tres cuentas `invalid.test`. Navegador integrado mediante cua_repl; no se afirma disponer de una suite Playwright automatizada persistente.

1. Login alumno; Usage muestra su uso activo y entrada Reportar problema.
2. Entrada preselecciona Resource y Usage propios; severidad Alta y descripción guardan reporte bajo actor/hora del servidor. Confirmación y enlace al detalle.
3. Detalle propio muestra snapshot de Mesa F, uso asociado y evento; no muestra usuario de uso previo ni controles de gestión.
4. Reporte de Space sin uso asociado: guardar y consultar detalle.
5. Reporte de LabSession: guardar y consultar detalle, sin requerir un Usage.
6. Login responsable; revisión del laboratorio lista los tres reportes. Detalle del Resource muestra uso asociado y uso previo sintético de otra persona, con aclaración de ausencia de responsabilidad automática.
7. Pasar a revisión con nota y resolver con nota. Se actualizan estado, resolución, hora e historial con actor/origen; desaparece el formulario al resolver.
8. Regreso como alumno: consulta la resolución y tres eventos, sin gestionar ni consultar historial ajeno.
9. Consola sin errores/warnings capturados. Ancho de viewport y contenido: 699 px, sin desbordamiento horizontal en la vista revisada; no se afirma una matriz exhaustiva de dispositivos.

Captura de evidencia de reporte resuelto guardada en el directorio de visualizaciones de la sesión. El preview se detuvo enviando SIGTERM directamente a fixturePid; emitió `Synthetic Incidents browser fixtures removed.` y terminó correctamente. Tab de navegador cerrada. La fixture limpia primero incidentes/eventos y después usos, participación, catálogo y cuentas de su laboratorio sintético; no usa datos reales ni base de desarrollo.

## Límites y decisiones pendientes

ADR 0014 fue aceptado explícitamente por el responsable el 7 de octubre de 2026, igual que ADR 0012/0013. Políticas aceptadas: objetivos activos al reportar, Usage propio todavía abierto si se vincula, severidad/objetivo/descripción sin edición posterior, sin notas adicionales fuera de transición ni reapertura. El contexto temporal es la hora de registro, no el momento demostrado de la falla.

Mostrar hasta 50 usos previos recientes, con aviso de historial adicional. No inferir que un único usuario es anterior o responsable ni que registros abiertos implican uso físico continuo. Historial de usuarios muestra nombres actuales, ubicación histórica de usos no reconstruida. Sin adjuntos, paginación, CSV/PDF, notificaciones, bloqueo de equipos, cancelación de reservas, Maintenance, movimientos de inventario, Audit global, Giussepe ni AWS. Revisar esas ampliaciones en incrementos explícitos.
