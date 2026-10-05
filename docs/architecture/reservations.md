# Reservations I y Reservations II

## Reservations I — backend

## Alcance y modelo

Flujo backend implementado: CheckAvailability, CreateReservation, GetReservation,
ListMyReservations y CancelReservation. Reservations I se mantiene como backend reutilizable; la integración web de Reservations II se describe al final. La composición de servidor está en
`src/modules/reservations/infrastructure/services.ts`. Los contratos de aplicación
no dependen de React, HTTP, Next.js ni IA.

`reservations`: UUID, Space obligatorio, creador User, startsAt, endsAt,
isExclusive, status, createdAt, cancelledAt. `reservation_resources`: PK
(reservationId, resourceId) y spaceId. Laboratory se deriva del Space; no se duplica
en Reservation. La asociación repite spaceId únicamente para FKs compuestas a
Reservation y Resource, impidiendo relaciones cruzadas incluso mediante SQL.

Cada reserva es exclusivamente una de dos modalidades: Space completo sin
asociaciones de recursos, o uno o varios recursos distintos del mismo Space.
Space y Resource activos son elegibles en este corte, sin categorías ni bandera
configurable. Location sólo organiza la ubicación. RB5 se resuelve con is_active
al consultar/crear; Maintenance y estado operativo detallado quedan pendientes.

## Tiempo, estado y propiedad

Entradas: ISO 8601 con segundos y offset explícito o Z. Las futuras interfaces
usarán `America/Mexico_City` como política inicial de interfaz/despliegue para
interpretar entradas locales; el backend rechaza horas locales ambiguas. Esta
política no restringe permanentemente a futuros laboratorios en otras zonas
horarias: podrán usar otra zona en su interfaz/despliegue, conservando instantes
con offset y almacenamiento timestamptz. La configuración por laboratorio queda
pendiente y no se implementa en este corte. No se asume timezone del proceso o servidor PostgreSQL.
Persistencia: `timestamptz`, instantes absolutos; representación usual UTC.
Intervalos finitos `[inicio, fin)`, inicio estrictamente menor que fin; límites
contiguos no entran en conflicto. La creación exige inicio estrictamente futuro,
revalidado después de esperar bloqueos. No hay ventana máxima/minima inventada.
Disponibilidad permite consultar pasado, con carácter informativo.

Estados: confirmed → cancelled. No hay reactivación, edición temporal ni borrado
físico en los servicios. Sólo el creador con `reservation.cancel` puede cancelar,
antes del inicio. Una segunda cancelación devuelve el mismo estado/cancelledAt,
incluso si luego transcurrió el intervalo. Reservas iniciadas/pasadas confirmed no
pueden cancelarse. Una cancelada conserva historial y deja de bloquear.

Permisos locales añadidos: reservation.read (disponibilidad y datos propios),
reservation.create y reservation.cancel. Ninguno concede acceso a reservas
ajenas. GetReservation y CancelReservation responden no encontrado para registros
ajenos/inexistentes/fuera del laboratorio. ListMyReservations filtra laboratorio
y creador y conserva ambos estados. Availability devuelve sólo un booleano, sin
revelar identidad ni detalles de las reservas que bloquean.

El rol inicial recibe estos permisos mediante migración; bootstrap usa el catálogo
actual. No se concede approve, manage_all, override ni permisos de series.

## Conflictos y transacciones

Para reservas confirmed en el mismo Space con intervalos superpuestos:

- Space exclusivo contra otro Space exclusivo: conflicto.
- Space exclusivo contra cualquier reserva de recursos del Space: conflicto en
  ambos órdenes, incluso si ambas pertenecen al mismo usuario.
- Recursos contra recursos: conflicto sólo si comparten al menos un Resource.
- Recursos diferentes comparten Space; espacios diferentes son independientes.

CheckAvailability no garantiza creación. Cada operación abre una transacción
READ COMMITTED, bloquea en modo SHARE las filas del camino concreto de permiso y
reutiliza AuthorizationService con un reader ligado a esa transacción. Los
permisos de membresías distintas nunca se combinan. Create bloquea Space antes de
leer conflictos, bloquea recursos y revalida estado/tiempo. Cancel bloquea Space y
reserva y vuelve a leer propiedad/estado. El adaptador llama reglas puras del
dominio; toda interfaz invoca los mismos servicios.

PostgreSQL refuerza la protección: triggers BEFORE toman bloqueo de Space;
triggers de restricción diferidos validan el estado final de padre y asociaciones,
modalidad, actividad de entidades y conflictos con `tstzrange(..., '[)') && ...`.
Las consultas PL/pgSQL VOLATILE ven los cambios confirmados después de esperar el
bloqueo en READ COMMITTED. Escrituras con otro aislamiento se rechazan para evitar
snapshots antiguos. SQLSTATE 23P01 se traduce a ReservationConflictError; 23503 a
ReservationTargetError; 23514 a ReservationInputError. Los servicios añaden
propiedad, autorización y reglas de cancelación que una cuenta DBA no representa.

Los bloqueos duran hasta commit/rollback. Se serializan escrituras del mismo
Space, sin bloquear por completo el Laboratory. No se añaden extensiones ni una
copia de intervalos por recurso. Las FKs RESTRICT preservan identidades
históricas y prohíben mover un Resource/Space referenciado a otro contexto. La
desactivación posterior no cancela reservas ya existentes; tampoco las oculta del
historial propio. El catálogo actual no permite mover recursos entre Spaces.

Fuentes técnicas: [bloqueos PostgreSQL 17](https://www.postgresql.org/docs/17/explicit-locking.html),
[visibilidad de triggers](https://www.postgresql.org/docs/17/trigger-datachanges.html) y
[snapshots SPI](https://www.postgresql.org/docs/17/spi-visibility.html).

## Revisión SQL previa a aplicar

Migración incremental: `0004_skinny_morg.sql`, generada con Drizzle y ampliada con
SQL de integridad explícito (como Spatial II). Se revisó íntegra antes de aplicar:

- CREATE TABLE: reservations, reservation_resources; dos PK (una compuesta).
- ALTER TABLE: cuatro FKs RESTRICT: reserva–Space, reserva–User y dos asociaciones
  compuestas; ninguna modificación de Better Auth.
- CREATE TYPE: ninguno; estado text con CHECK.
- Índices: tres UNIQUE/PK relevantes (PK asociación, UNIQUE id/space de reservas,
  UNIQUE id/space de recursos), además de PK UUID y tres índices no únicos
  (creador, espacio/intervalo, recurso asociado). Los UNIQUE se crean antes de las
  FKs que los necesitan.
- CHECK: intervalo finito válido y coherencia estado/cancelledAt.
- Exclusion constraints: ninguna; regla jerárquica cubierta por triggers.
- Tres funciones PL/pgSQL y cuatro triggers (dos BEFORE, dos constraint diferidos).
- Extensiones: ninguna. tstzrange, bloqueos de fila y PL/pgSQL son PostgreSQL nativo.
- Datos: INSERT idempotentes de tres permisos y asignaciones al responsable existente.
- Sin DROP, TRUNCATE, DELETE, cambios de columnas existentes, rescritura de
  migraciones aplicadas ni pérdida de datos. Único cambio de Spatial: índice
  compuesto de Resource necesario para la FK.

## Pruebas y límites

Pruebas puras de intervalos, entradas, modalidades, conflicto y cancelación;
pruebas sobre PostgreSQL separado con servicios, permisos, aislamiento,
restricciones y carreras reales con conexiones distintas. Las carreras deben
persistir exactamente una reserva y devolver un conflicto, tanto para Resource
como Space y exclusividad contra recurso. También se verifica SQL directo y
estado final diferido sin depender de mocks.

El ADR [0009](../decisions/0009-individual-reservations.md) está **Aceptada** por
aprobación explícita del responsable con la implementación actual. Se conservan
como decisiones aprobadas la elegibilidad de Space/Resource activos para este
corte, la propiedad del creador para lectura/cancelación y la serialización por
Space en READ COMMITTED. El SRS no determina la política exacta de reservabilidad,
timezone, inicio futuro, propiedad ni cancelación; estas reglas quedan resueltas
por la decisión de proyecto aprobada. America/Mexico_City es sólo la política
inicial de interfaz/despliegue, extensible a otras zonas horarias.
Reservations II implementa la UI individual descrita abajo. Sigue pendiente la configuración de zona horaria por laboratorio.
También quedan pendientes
paginación del listado, reservabilidad configurable, estado operativo detallado,
aprobaciones y permisos para terceros cuando exista un flujo autorizado.
Recurrencia, Academic, FloorPlan, Inventory, Notifications, auditoría general,
Giussepe y AWS siguen fuera de alcance.

## Resultado de validación — 5 de octubre de 2026

- Node.js 24.21.0 y pnpm fijado por el proyecto; sin cambios de dependencias.
- `pnpm check`: correcto (ESLint, TypeScript, 28 pruebas unitarias/configuración y
  Prettier). Se agregaron seis pruebas puras de Reservations.
- `pnpm test:integration`: correcto, 52 resultados aprobados; incluye 19 escenarios
  de Reservations más su prueba contenedora, conservando la suite previa.
- Seis carreras reales aprobadas: Resource/Resource, Space/Space y Resource/Space,
  tanto por servicios simultáneos como por conexiones SQL independientes. Cada
  pareja produjo exactamente un éxito, un conflicto y una fila persistida.
  Las carreras SQL verificaron que la segunda conexión esperaba un bloqueo real.
- Cancelación después del inicio rechazada por servicio y PostgreSQL; cancelación
  repetida preserva fecha e historial. Conjuntos de recursos requieren disponibilidad
  de todos sus miembros.
- Migración aplicada a la base separada de pruebas y a desarrollo, después de la
  revisión SQL descrita arriba. Lectura posterior de desarrollo: cinco migraciones,
  cuatro triggers de Reservations, tres permisos y cero reservaciones de prueba.
- Se reactivó el contenedor PostgreSQL existente sin recrear ni borrar su volumen.
- `pnpm build`: falló por EPERM al enlazar un puerto en el worker PostCSS/Turbopack
  del entorno. `pnpm exec next build --webpack`: correcto sobre el código final,
  incluida compilación TypeScript y generación de rutas de producción.
- No se añadió UI; no se ejecutaron pruebas de navegador de un flujo nuevo. El
  incremento es backend y su flujo completo se validó mediante servicios y base real.
- SRS sin modificaciones. Durante la implementación el ADR 0009 quedó Propuesta;
  posteriormente el responsable aprobó explícitamente la implementación actual y
  su política inicial de zona horaria, y el ADR pasó a Aceptada mediante una
  actualización exclusivamente documental.

## Archivos de este incremento

Creados:

- `src/modules/reservations/domain/reservation.ts`
- `src/modules/reservations/application/reservation-store.ts`
- `src/modules/reservations/application/reservations.ts`
- `src/modules/reservations/infrastructure/reservation-schema.ts`
- `src/modules/reservations/infrastructure/reservation-store.ts`
- `src/modules/reservations/infrastructure/services.ts`
- `drizzle/0004_skinny_morg.sql`
- `drizzle/meta/0004_snapshot.json`
- `tests/reservation-domain.test.ts`
- `tests/integration/reservations.test.ts`
- `docs/decisions/0009-individual-reservations.md`
- `docs/architecture/reservations.md`

Modificados:

- `src/modules/reservations/README.md`
- `src/modules/identity/domain/access-catalog.ts`
- `src/modules/spatial/infrastructure/spatial-schema.ts`
- `src/infrastructure/database/schema.ts`
- `drizzle/meta/_journal.json`
- `tests/integration/auth-postgres.test.ts` (conteo de migraciones: cinco)
- `README.md`
- `docs/architecture/README.md`
- `docs/architecture/spatial-catalog.md`
- `docs/decisions/README.md`

## Reservations II — integración web individual

Implementa el flujo seleccionado: login → Laboratory → Reservaciones → seleccionar
Space/Resources → consultar disponibilidad → crear → listado propio → detalle →
cancelar. Reutiliza el App Shell, Tailwind y componentes propios existentes; no se
instala shadcn/ui ni una suite E2E nueva.

### Rutas, navegación y adaptador

- `/app/labs/[slug]/reservations`: `ListMyReservations`, listado vacío explicativo,
  próximas/en curso e historial pasado/cancelado. Sin estadísticas ni paginación.
- `/app/labs/[slug]/reservations/new`: formulario responsivo con Space primero,
  modalidad exclusiva o uno/varios Resources del mismo Space y fecha/hora inicial/final.
- `/app/labs/[slug]/reservations/[reservationId]`: `GetReservation`, modalidad,
  Space/Resources, Locations visibles como contexto, intervalo, estado y marcas de
  creación/cancelación. Inexistente/ajena/no autorizada conserva respuesta uniforme.
- La navegación del laboratorio añade Reservaciones. `loading.tsx` y `error.tsx`
  presentan carga y recuperación sin SQLSTATE ni excepciones internas.

`ReservationWeb` (`src/modules/reservations/web/reservation-web.ts`) adapta los
formularios y compone servicios; no consulta tablas. `web/services.ts` conecta
`requireCurrentActor`, `GetLaboratoryBySlug`, `AuthorizationService`, los servicios
Spatial y los cinco servicios de Reservations I. Cada operación resuelve el actor
validado y autoriza el slug actual. Ningún actor, permiso o laboratorio autoritativo
se acepta del formulario. Las páginas/acciones conservan las redirecciones de sesión
mediante la propagación de los errores internos de Next.js.

`reservationFormAction` invoca CheckAvailability o CreateReservation según el botón
pulsado. `cancelReservationAction` invoca CancelReservation. Creación revalida el
listado y redirige al detalle con feedback; cancelación revalida listado/detalle,
conservando el historial. Los formularios impiden envíos mientras están pendientes.
Cancelar requiere una confirmación visual sencilla; el servicio sigue decidiendo
si la operación es válida o idempotente.

### Catálogo, permisos e historial

ListSpaces proporciona espacios activos autorizados. ListResources proporciona
únicamente recursos activos del espacio; ListLocations añade ubicación cuando el
actor tiene `location.read`. No tener `resource.read` permite el formulario exclusivo,
pero no ofrece selección de recursos. No tener `space.read` impide el formulario.
El adaptador vuelve a consultar el catálogo autorizado al enviar; el servicio de
Reservations I revalida target/actividad/relaciones dentro de su operación. Cambiar
Space limpia la selección de recursos en React; manipular el formulario sigue siendo
rechazado por adaptador/servicio, sin confiar en React.

Listado y detalle exigen `reservation.read`; muestran únicamente registros devueltos
por ListMyReservations/GetReservation. Los permisos de creación/cancelación controlan
la presentación de botones, mientras los servicios exigen sus permisos en servidor.
No se combinan laboratorios ni se añaden permisos. La autorización Spatial para
etiquetas es independiente: la falta de permiso no elimina historial propio. Cuando
una entidad fue desactivada o no es visible por los servicios de catálogo actuales,
se muestra «fuera del catálogo visible» y su identificador de la reserva propia.
No se añade una lectura SQL alternativa de entidades históricas ni de reservas ajenas.
Las etiquetas/Locations corresponden al catálogo actual, no a una instantánea histórica.

### Tiempo y disponibilidad

Los inputs `datetime-local` reciben fecha y hora local hasta minutos. `web/time.ts`
usa Intl con la zona IANA `America/Mexico_City` explícita, obtiene offsets alrededor
de la fecha y verifica la conversión de ida/vuelta. Rechaza fechas imposibles y horas
históricas inexistentes/ambiguas. Envía ISO UTC con `Z`; no parsea timestamps locales
con la timezone del proceso o navegador. El formato de listado/detalle también fija
la zona explícitamente. Se reutiliza Intl de Node.js 24; no hay nueva dependencia.
Se mantienen timestamptz, intervalos `[inicio, fin)` y validación backend de inicio
futuro para creación conforme al ADR 0009.

CheckAvailability muestra sólo «Disponible» o «No disponible para el intervalo
seleccionado», sin datos de reservas bloqueantes. Su mensaje se vincula a todos los
campos consultados y desaparece al cambiar selección/horario. CreateReservation
siempre ejecuta su validación transaccional; nunca recibe una autorización derivada
del check. ReservationConflictError posterior al check muestra un mensaje para
escoger otro horario. Entradas/targets inválidos, falta de permisos, inexistencia y
cancelación iniciada/pasada tienen mensajes públicos. Errores inesperados se propagan
al límite de error; se recomienda revisar el listado antes de repetir una creación.

### Pruebas y validación del incremento

- `tests/reservation-web.test.ts`: cuatro pruebas de conversión independiente de TZ,
  offsets históricos, fechas inválidas/gaps/ambigüedades, mensajes públicos y vigencia
  del feedback de disponibilidad.
- `tests/integration/reservation-web.test.ts`: 17 escenarios del adaptador con servicios
  reales y PostgreSQL separado. Cubren ausencia de sesión, permisos, catálogo activo,
  Space/uno/varios Resources, target manipulado, disponibilidad, creación, conflicto
  tras check, propiedad/listado/detalle, idempotencia/historial, cancelación iniciada,
  laboratorio manipulado, permisos Spatial y entidades desactivadas.
- Se conserva íntegra la suite Reservations I y sus seis carreras PostgreSQL;
  las pruebas web no reemplazan sus garantías transaccionales.
- `pnpm check`: correcto, 32 pruebas unitarias/configuración más lint, TypeScript y formato.
- `pnpm test:integration`: correcto, 70 resultados; sin mocks de garantías PostgreSQL.
- `pnpm build`: bloqueado por EPERM del worker PostCSS/Turbopack al enlazar un puerto,
  igual al límite ya registrado para Reservations I.
- `pnpm exec next build --webpack`: correcto sobre el código final; incluye las tres
  rutas nuevas y la compilación TypeScript.
- Navegador integrado contra build de producción en `localhost:3001` y base local
  separada `_test`: sesión ausente redirige al login; login, selección de Laboratory,
  navegación Reservaciones, carga/listado vacío, disponibilidad, creación exclusiva
  de Space, creación de varios Resources, Locations visibles, listado propio,
  detalle y cancelación confirmada con estado/fecha e historial actualizado.
- Navegador: conflicto al confirmar un intervalo ya ocupado devuelve feedback
  público. El caso de una operación que gana entre check/create se verifica con
  servicios reales en la integración automatizada, además de las carreras de I.
- Formulario a 390 × 844: sin desbordamiento horizontal ni overlay. Se comprobó
  visualmente el formulario de recursos y el detalle; no se añadió infraestructura E2E.
- La verificación detectó y corrigió la captura de `datetime-local` mediante `input`
  y el reset automático de React después de consultar disponibilidad. Se conservan
  las entradas para confirmar y se invalida feedback al cambiarlas.
- Hubo un `Failed to fetch` durante el cierre/reinicio del servidor temporal; se
  repitió login y se completó el flujo con la fixture mantenida hasta finalizar.
  Los datos sintéticos fueron limpiados, verificando cero usuarios/reservas de esa
  fixture. No se usaron credenciales reales ni se alteró la base de desarrollo.

### Alcance conservado y pendientes

Reservations II no añade migraciones, permisos, tablas, dependencias ni cambios de
reglas de dominio. SRS y ADR aceptados se conservan sin edición por este incremento.
Los cambios documentales previos de aceptación del ADR 0009 se preservan.

Quedan pendientes paginación según volumen real, nombres históricos de entidades
fuera del catálogo visible, configuración de timezone por laboratorio, reservabilidad
configurable y calendarios avanzados. Recurrencia, aprobaciones, reservas de terceros,
override, FloorPlan, Inventory, Maintenance, Academic, Notifications, email, Giussepe,
RAG, AWS y auditoría general siguen fuera de alcance.
