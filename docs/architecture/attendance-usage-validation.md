# Validación de Attendance I y Usage I

Fecha: 6 de octubre de 2026. Node.js 24.19.0, pnpm y lockfile existente; sin nuevas dependencias. SRS original sin cambios. Se preservaron los cambios documentales de aceptación de Academic I que ya estaban presentes al iniciar este trabajo.

## Cambios entregados

- Módulos nuevos `src/modules/attendance/` y `src/modules/usage/`: dominio, contratos/servicios de aplicación, persistencia y adaptadores web.
- Rutas Attendance (propia y padrón de sesión), Usage (propia y trazabilidad de recurso), entrada `/check-in/[slug]/[locationId]`, formularios con feedback y acciones de servidor.
- Integración en navegación del laboratorio, sesión académica y catálogo espacial; retorno seguro desde login.
- Catálogo de seis permisos y helper de autorización transaccional en Identity; único índice compuesto adicional de LabSession en esquema Academic. No se cambian sus ciclos ni participantes.
- Migraciones 0007/0008 con snapshots y journal nuevos; ninguna migración anterior se reescribe. La prueba de autenticación actualiza su expectativa de siete a nueve migraciones.
- Pruebas unitarias e integración, fixture de navegador reproducible, documentación de arquitectura y ADR 0012/0013 en Propuesta. Next.js actualiza automáticamente `next-env.d.ts` al generar tipos de producción.

## Modelo y reglas comprobadas

Attendance tiene identidad, sesión, usuario, Space, Location opcional, checkInAt nullable, estado, actor original, versión y timestamps. Estados present/late/absent; autocaptura sólo present. Una fila por persona/sesión. Las correcciones guardan actor/motivo/origen/snapshots y preservan el check-in original; no se genera automáticamente retardo, ausencia ni uso efectivo.

Nueva asistencia sólo open. Historial existente consultable sin recrearlo tras cierre. Alta manual por personal sólo open, corrección existente open/closed; no altas en closed/cancelled ni correcciones en cancelled. Gestor participante no puede usar administración sobre ninguna asistencia de esa sesión. El padrón y eventos requieren attendance.manage; attendance.read sólo consulta propios.

Deep-link estable de Location lleva al login conservando el destino. Después identifica actor, laboratorio, Location/Space activos y consulta participación propia, Practice publicada y sesiones open del mismo Space. Horarios sólo ordenan/muestran. Cero candidatos: explicación sin escritura; uno: preselección; varios: elección explícita. Confirmación vuelve a validar dentro de transacción. El enlace no acredita presencia física y abrirlo no escribe. Generación visual/impresión de QR pendiente.

Usage registra usuario/Resource/Space, exactamente un contexto académico o de reserva e inicio/fin reales. Académico requiere participante y open; reserva requiere creador propio, confirmed, intervalo vigente y recurso incluido o espacio exclusivo. El horario se revalida después de los locks. Un uso activo por persona/recurso, sin imponer exclusividad entre personas. Inicio repetido mismo contexto y fin repetido son idempotentes; cambiar contexto activo produce conflicto. Terminar propio no requiere contexto aún abierto/vigente. Asistencia y reserva nunca generan uso ni éste genera asistencia.

## Autorización, SQL y aplicación

attendance.read/checkin/manage y usage.read/record/trace se añaden sólo al catálogo y responsable inicial; bootstrap reutiliza el catálogo completo. No se crea rol institucional Student/Teacher ni se habilita administración gráfica de cuentas. Alumnos requieren membresía y permisos mínimos asignados mediante el mecanismo autorizado existente.

Ambos servicios reautorizan con AuthorizationService en READ COMMITTED y SHARE sobre actor/laboratorio/membresía/ruta concreta de permiso. Academic usa orden Practice → LabSession → Space y relaciones; Usage de reserva respeta Space → Reservation → asociación → Resource. Finalizar uso bloquea la fila propia. Attendance usa UNIQUE y versión optimista; Usage UNIQUE parcial de uso activo.

SQL completo revisado antes de aplicar. Attendance: dos tablas (11/8 columnas), dos PK, un UNIQUE propio y otro de LabSession, dos índices auxiliares, seis FKs RESTRICT, cuatro CHECK, una función y trigger contra UPDATE de eventos, tres permisos/asignaciones iniciales. Usage: dos tablas (9/7 columnas), dos PK, un UNIQUE parcial y tres índices auxiliares, siete FKs RESTRICT, tres CHECK, una función/trigger y tres permisos/asignaciones. Se ordenó el nuevo índice de LabSession antes de su FK dependiente.

No DROP, TRUNCATE ni DELETE inesperados en migraciones; sin extensiones, schema push, cambios de saldos ni reescritura de filas académicas/reservaciones. Las limpiezas DELETE corresponden únicamente a fixtures sintéticas de la base protegida `_test`.

`pnpm db:migrate`: correcto sobre PostgreSQL local de desarrollo. La preparación de integración también aplicó ambas migraciones a la base aislada `_test`. Ninguna URL ni credencial real fue impresa.

## Comandos ejecutados

| Comprobación            | Resultado final                                                                           |
| ----------------------- | ----------------------------------------------------------------------------------------- |
| `pnpm check`            | Correcto: ESLint sin warnings, TypeScript, 44 pruebas unitarias/configuración y Prettier. |
| `pnpm test:integration` | Correcto: 113 resultados aprobados, cero fallos/omisiones, PostgreSQL real.               |
| `pnpm build`            | Correcto con Turbopack; incluye todas las rutas nuevas.                                   |
| `pnpm db:migrate`       | Correcto; migraciones aditivas aplicadas a desarrollo local.                              |
| `git diff --check`      | Correcto en la revisión de cambios.                                                       |

Los cortes aislados produjeron 12 resultados Attendance y 10 Usage (incluyen sus pruebas contenedoras). La suite conserva las regresiones existentes de Academic, Identity, Spatial, Reservations e Inventory. Casos nuevos incluyen duplicación concurrente de check-in, corrección concurrente con versión, cierre frente a check-in, inicio/fin simultáneo de uso, cierre frente a inicio, relaciones cruzadas, revocación, recurso/Location desactivado y manipulación de actor/origen desde formulario.

La primera ejecución completa detectó una expectativa antigua de siete migraciones y formato pendiente; se corrigieron y la suite final pasó con nueve migraciones. Las verificaciones de FK se separaron de la unicidad activa para probar cada garantía sin que una enmascarara a otra.

## Recorrido visual ejecutado

Navegador integrado contra producción en `localhost:3108`, exclusivamente con fixture `_test` e identidades `invalid.test`. agent-browser no estaba instalado, por lo que el recorrido se ejecutó mediante el navegador integrado; no se afirma disponer de una suite automatizada Playwright persistente.

Se comprobó:

1. Entrada por deep-link de Mesa F sin sesión: login conserva destino y ubicación.
2. Login alumno: identidad no editable, preselección de única sesión abierta y ausencia inicial de constancia.
3. Confirmación explícita: asistencia presente y hora persistida; repetición conserva una constancia.
4. Usage inicialmente vacío después de Attendance; selección de Resource y contexto por nombre/horario.
5. Inicio y finalización explícitos: muestra uso en curso, luego terminado con intervalo.
6. Login personal: padrón muestra nombre de Location, estado y hora; corrección con motivo cambia estado conservando hora y muestra actor/motivo en historial.
7. Trazabilidad autorizada de Resource: persona, maquinaria e intervalo, con aclaración de que no implica responsabilidad.
8. Repetición del flujo sobre el build final con etiquetas legibles; sin errores ni warnings de consola registrados.
9. Usage a 390 × 844: ancho de contenido 375, sin desbordamiento horizontal; override de viewport restablecido.

Fixture: `pnpm exec node --import tsx tests/e2e/attendance-usage-browser-fixture.ts` tras `pnpm build`. No ejecutar simultáneamente con integración (la prueba de autenticación espera cuentas sin fixtures). El JSON muestra `fixturePid`; enviar SIGTERM a ese PID permite detener preview y limpiar. Evitar terminar abruptamente el envoltorio pnpm/tsx: la primera interrupción dejó dos cuentas sintéticas, retiradas expresamente sólo de `_test`; la segunda ejecución utiliza señal directa al proceso y emitió el mensaje de limpieza. Una consulta posterior confirmó cero cuentas sintéticas de estos recorridos y nueve migraciones en desarrollo local.

## Limitaciones y decisiones pendientes

- ADR 0012 y 0013 permanecen Propuesta: se autorizó el incremento, sin ratificar automáticamente taxonomía institucional, correcciones históricas detalladas o exclusividad operacional.
- Se entrega deep-link estable, con generación visual/imprimible de QR pendiente. Un QR copiado puede abrirse remotamente.
- No editar hora original desde UI, crear asistencia retroactiva en sesión cerrada ni corregir canceladas. Registros de ausencia corregidos pueden no tener evidencia temporal de llegada.
- Uso requiere inicio/fin explícitos; no hay cierre automático ni cierre por personal de usos de cuentas revocadas.
- Historial de uso ya está disponible para un futuro Incidents, pero no se implementa su integración ni se infiere culpa.
- Sin reportes PDF/CSV, paginación, grupos/periodos, préstamos, maquinaria ligada a inventario, Maintenance, notificaciones, Audit global, Giussepe ni AWS.
