# Reservations I

## Alcance y modelo

Flujo backend implementado: CheckAvailability, CreateReservation, GetReservation,
ListMyReservations y CancelReservation. Sin rutas, Server Actions ni UI; la
integración web corresponde a Reservations II. La composición de servidor está en
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
interpretarán entradas locales en `America/Mexico_City`; el backend rechaza horas
locales ambiguas. No se asume timezone del proceso o servidor PostgreSQL.
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

El ADR [0009](../decisions/0009-individual-reservations.md) está **Propuesta**.
El SRS no determina la política exacta de reservabilidad, timezone, inicio futuro,
propiedad ni cancelación; aquí se explicitan para evaluación del incremento.
Pendiente ratificación y UI para Reservations II. También quedan pendientes
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
- SRS sin modificaciones; ningún ADR fue marcado Aceptada durante este incremento.

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
