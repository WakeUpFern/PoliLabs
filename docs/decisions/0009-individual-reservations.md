# 0009 — Reservaciones individuales y exclusividad por espacio

Estado: **Aceptada**

## Contexto

Reservations I fue seleccionado explícitamente. SRS RF10, RF12–13, RB5–8,
RNF4–6, §§12–13, 24, 30–31 y ADR 0006 requieren identidad espacial compartida,
recursos del mismo espacio y protección concurrente. El SRS no fija timezone,
reservabilidad concreta, cancelación ni límites temporales.

## Decisión

Una reservación contiene un Space, creador, intervalo, modalidad exclusiva o
recursos individuales y estado confirmed/cancelled. El laboratorio se deriva del
Space. Todos los espacios/recursos activos son elegibles en este corte; Location
no es reservable. No se añade clasificación ni propiedad configurable todavía.

Usar timestamptz e intervalos [inicio, fin). America/Mexico_City es la política
inicial de interfaz y despliegue: las interfaces interpretarán allí las entradas
locales y enviarán instantes con offset; los servicios no aceptan horas locales
ambiguas. Esta zona no es una restricción permanente del dominio ni de futuros
laboratorios: podrán adoptarse otras zonas horarias al definir su configuración de
interfaz/despliegue, conservando el contrato de instantes con offset y timestamptz.
Este incremento no implementa configuración de zona horaria por laboratorio. Crear sólo con inicio futuro. Leer/cancelar sólo
reservaciones propias, con permiso local explícito; cancelar antes del inicio,
idempotentemente si ya está cancelada.

Serializar escrituras por fila de Space en READ COMMITTED, con validación
transaccional diferida PostgreSQL de relaciones y conflictos sobre el estado final
padre/asociaciones. Reautorizar usando AuthorizationService dentro de la transacción
con las filas de autorización bloqueadas. No usar extensiones PostgreSQL.

## Alternativas

Una consulta previa sola no garantiza atomicidad. Exclusiones GiST por recurso
resuelven conflictos de recursos pero necesitan otra representación para la
interacción de exclusividad de Space con recursos, duplicando intervalos/estado.
SERIALIZABLE exige reintentos y no reemplaza integridad relacional. Un bloqueo por
laboratorio serializa innecesariamente espacios independientes.

## Consecuencias

La implementación actual de Reservations I queda aprobada explícitamente por el
responsable del proyecto. Las escrituras del mismo espacio se serializan aunque
reserven recursos distintos; espacios diferentes conservan independencia. Los
triggers admiten sólo READ COMMITTED para evitar snapshots antiguos. Las FKs
compuestas añaden space_id redundante a la asociación, protegido en ambos extremos.
El historial conserva entidades aunque luego se desactiven. La desactivación
posterior no cancela reservas existentes; RB5 se aplica a nueva disponibilidad y
creación mediante is_active, sin inventar Maintenance.

## Referencias SRS y aprobación

[SRS original](../srs/PoliLabs-SRS.tex), requisitos arriba indicados. La política
concreta de tiempo, elegibilidad de Space/Resource activos para este corte,
propiedad del creador para lectura/cancelación y serialización por Space en
READ COMMITTED quedan aceptadas mediante aprobación explícita del responsable,
posterior a la implementación. Son decisiones del proyecto que completan las
omisiones del SRS; el original permanece sin modificaciones. America/Mexico_City
se aprueba como política inicial de interfaz/despliegue con el alcance temporal y
geográfico indicado arriba.
