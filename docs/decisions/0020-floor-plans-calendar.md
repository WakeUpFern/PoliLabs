# 0020 — Planos de espacios y calendario de ocupación

Estado: **Propuesta** (15 de octubre de 2026; implementada en Spatial III y Reservations III, pendiente de aprobación explícita del responsable)

## Contexto

§33 pide como criterios del MVP «configurar un espacio con plano y recursos visibles» (4) y «mostrar reservaciones en calendario y plano» (6). RF8 y RF9 piden asociar uno o más planos a un espacio y representar recursos reservables con coordenadas y dimensiones opcionales; §12.4 admite elementos que representan recursos, ubicaciones o elementos visuales no interactivos; §13.5 pide que el mismo motor de reservaciones alimente el plano tipo selección de asiento y el calendario de día, semana o mes; el flujo 27.1 muestra recursos libres, ocupados o bloqueados. §22 sugiere `floor_plans` y `floor_plan_elements`.

El [ADR 0009](0009-individual-reservations.md) limita la lectura de reservaciones a las propias y hace que la disponibilidad devuelva sólo un booleano. Un calendario o un plano de ocupación necesitan conocer los intervalos ocupados por otras personas, lo que amplía esa política.

## Decisión

**D1 — Plano como configuración del Space.** `floor_plans` (nombre, ancho y alto en celdas de 1 a 100, desactivación lógica) pertenece a un Space. `floor_plan_elements` coloca un rectángulo entero `x, y, ancho, alto` de tipo `resource`, `location` o `label`. Las celdas son una cuadrícula abstracta, no metros. Cada elemento repite `space_id` para FKs compuestas hacia plano, recurso y ubicación del mismo Space; un CHECK exige exactamente un objetivo según el tipo; índices únicos parciales impiden colocar dos veces el mismo recurso o ubicación en un plano. Triggers verifican que todo elemento quepa en su plano tanto al escribir el elemento como al redimensionar el plano, bloqueando la fila del plano. Los elementos son configuración sin historial y se retiran físicamente; recursos o ubicaciones desactivados conservan su elemento, que deja de mostrarse.

**D2 — Permisos.** Consultar planos usa `space.read` y editarlos `space.manage`: el plano es parte de configurar el espacio (§33.4). No se añaden permisos ni migraciones de permisos. Los nombres de recursos y ubicaciones se resuelven con sus propios servicios; sin `resource.read` o `location.read` el elemento se muestra con un nombre genérico.

**D3 — Ocupación.** `ListSpaceOccupancy` devuelve, con `reservation.read`, las reservaciones confirmadas de un Space activo del laboratorio que se superponen a una ventana `[inicio, fin)` de hasta 42 días: intervalo, modalidad exclusiva y recursos. Las ajenas no incluyen id ni creador; las propias incluyen su id para enlazar al detalle. Las canceladas no aparecen. Esta es la ampliación sobre el ADR 0009: además del booleano de disponibilidad, quien puede reservar ve qué está ocupado y cuándo, pero no quién reservó.

**D4 — Estados del plano.** Para un intervalo, cada recurso es `blocked` si no está en operación (RB5, Maintenance I), `occupied` si una reservación confirmada lo incluye o reserva el espacio completo, y `free` en otro caso. Los bloqueos de disponibilidad de RF14 no existen todavía. Un recurso libre enlaza al formulario de nueva reservación prellenado; la creación sigue pasando por `CreateReservation`, que revalida todo.

**D5 — Calendario.** Vista de día, semana (lunes a domingo) o mes (semanas completas) por Space y, opcionalmente, por Resource. Los días son fechas de pared en America/Mexico_City; cada límite se convierte con la misma conversión explícita de Reservations II, sin usar la zona del proceso o del navegador.

## Alternativas consideradas

- Calendario sólo con reservaciones propias: no cumple §33.6 ni muestra la ocupación del plano.
- Mostrar el nombre de quien reservó: no es necesario para elegir horario y expone datos personales; requeriría un permiso de supervisión que el SRS no define.
- Permisos `floor_plan.read/manage` nuevos: sin necesidad concreta distinta de administrar el espacio.
- Coordenadas en metros o editor de arrastre: añaden complejidad y dependencias sin requisito.

## Consecuencias

- Una migración aditiva (`0014_floor_plans_i.sql`) con dos tablas, dos funciones y dos triggers; sin cambios de datos existentes.
- Cualquier miembro con `reservation.read` ve los intervalos ocupados del Space consultado, sin identidad.
- Pendientes: bloqueos de disponibilidad (RF14), recurrencia, editor gráfico, coordenadas para ubicaciones jerárquicas profundas y zona horaria por laboratorio.

## Referencias SRS

RF8, RF9, RF10, §12.4, §13.5, flujo 27.1, §22, §33 criterios 4 y 6, RB5.
