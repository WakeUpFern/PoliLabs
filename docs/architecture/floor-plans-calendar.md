# Spatial III y Reservations III — planos y calendario

Estado: implementado. Decisión: [ADR 0020 — Propuesta](../decisions/0020-floor-plans-calendar.md).

## Alcance

Cubre los criterios 4 y 6 de §33: configurar un espacio con plano y recursos visibles, y mostrar reservaciones en calendario y plano.

- `src/modules/spatial/domain/floor-plan.ts`: normalización de planos y elementos, límites de la cuadrícula.
- `src/modules/spatial/application/floor-plans.ts`: `FloorPlanService` (listar, consultar, crear, editar, desactivar, colocar, mover y retirar elementos) sobre `space.read`/`space.manage`.
- `src/modules/spatial/infrastructure/floor-plan-store.ts`: transacción READ COMMITTED con `authorizeLocked`, plano bloqueado `FOR SHARE`/`FOR UPDATE`, referencias activas del mismo Space.
- `src/modules/reservations/application/reservations.ts`: `ListSpaceOccupancy` (`reservation.read`, ventana ≤ 42 días, ajenas sin id ni creador).
- `src/modules/reservations/domain/reservation.ts`: `occupancyEntry` y `resourceOccupancy` (libre, ocupado, bloqueado por RB5).
- `src/modules/reservations/web/calendar.ts`: rangos de día/semana/mes en America/Mexico_City.

## Interfaz

- `/app/labs/[slug]/spaces/[spaceSlug]`: sección Planos con listado y alta.
- `/app/labs/[slug]/spaces/[spaceSlug]/plans/[planId]`: plano SVG sin JavaScript de cliente, intervalo consultable, estado por recurso, enlace «Reservar» prellenado para recursos libres y edición de elementos para `space.manage`.
- `/app/labs/[slug]/reservations/calendar`: calendario por Space y Resource opcional, vistas Día/Semana/Mes.
- `/app/labs/[slug]/reservations/new` acepta `space`, `resource`, `start` y `end` para prellenar; el servicio de creación revalida.

## Persistencia

Migración `0014_floor_plans_i.sql`, generada con Drizzle y revisada: `floor_plans` primero con su UNIQUE `(id, space_id)` antes de las FKs compuestas de `floor_plan_elements`; CHECK de objetivo y de caja; índices únicos parciales por recurso/ubicación; triggers `floor_plan_elements_within_plan` y `floor_plans_keep_elements` (SQLSTATE 23514). Sin DROP, DELETE ni cambios de tablas existentes.

## Validación

- Unitarias: `tests/floor-plan-calendar.test.ts` (normalización, límites, ocupación, rangos y medianoches con horario de verano histórico).
- Integración PostgreSQL: `tests/integration/floor-plans.test.ts` (permisos, aislamiento por laboratorio, referencias del mismo Space, límites en servicio y SQL directo, ocupación sin identidad ajena, ventana, canceladas, desactivación lógica).
- E2E: `tests/e2e/floor-plans.spec.ts` en escritorio y móvil.
