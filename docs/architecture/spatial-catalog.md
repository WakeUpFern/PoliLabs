# Catálogo espacial — Spatial I y Spatial II

Estado: implementado.

## Alcance

Spatial I introduce `Space` como catálogo operativo perteneciente a un único `Laboratory`, conforme al SRS §12 y al ADR 0006. Cada espacio tiene UUID, nombre, slug local al laboratorio, capacidad opcional positiva y estado activo. La unicidad se protege con `(laboratory_id, slug)` y la desactivación es lógica.

Spatial II añade la organización física básica dentro de un espacio:

```text
Laboratory
  └── Space
        ├── Location (parent_id opcional)
        └── Resource (location_id opcional)
```

`Location` tiene UUID, nombre, espacio, padre opcional, estado activo y marcas de tiempo. No necesita slug porque no participa en rutas ni existe otro caso de uso que lo requiera. `Resource` representa únicamente la identidad física individual necesaria para saber qué existe y dónde está: UUID, nombre, espacio, ubicación opcional, estado activo y marcas de tiempo. Los nombres no son únicos; la identidad estable es el UUID.

Spatial conserva fuera clasificación, reservabilidad configurable, planos, coordenadas, horarios e inventario. [Reservations I](reservations.md) incorpora disponibilidad y reservaciones individuales; utiliza Space/Resource activos como elegibles en este corte sin introducir lógica temporal en Spatial. En particular, Spatial II no decide todavía si un `Resource` será también un activo o tendrá relación con `InventoryItem`.

## Autorización y escritura

- `space.read` consulta únicamente espacios activos del laboratorio autorizado.
- `space.manage` crea, edita y desactiva espacios del mismo laboratorio.
- `location.read` y `resource.read` consultan entidades activas del espacio autorizado.
- `location.manage` y `resource.manage` crean, editan, mueven y desactivan sus entidades respectivas.
- Los casos de uso reutilizan `AuthorizationService`.
- Las escrituras revalidan usuario, membresía, laboratorio y permiso dentro de la transacción que modifica el catálogo, evitando confiar sólo en la verificación previa de presentación.
- Las lecturas acotan también el `space_id` por el `laboratory_id` autorizado. Una ruta, un slug o un UUID nunca conceden acceso por sí mismos.

Las migraciones de cada incremento agregan sus permisos al catálogo y los asignan al rol inicial `laboratory_responsible` cuando ya existe. El bootstrap también incluye el catálogo vigente en instalaciones nuevas.

## Persistencia e invariantes

PostgreSQL protege la clave foránea de cada entidad, nombres no vacíos, autopadre y asociaciones dentro del mismo espacio mediante FKs compuestas. Un trigger recorre ancestros e impide ciclos; un advisory lock transaccional por espacio serializa cambios jerárquicos concurrentes. Los servicios sólo aceptan padres y ubicaciones activas.

Desactivar una ubicación con hijos activos o recursos activos se rechaza. No hay cascada: el actor debe mover o desactivar primero esos dependientes. Desactivar ubicaciones y recursos conserva sus filas y relaciones históricas.

## Casos de uso e interfaz

- `Location`: listar activas, crear, editar, cambiar padre y desactivar.
- `Resource`: listar activos, crear, editar, asignar/cambiar/quitar ubicación y desactivar.

`/app/labs/[slug]/spaces` sigue siendo el catálogo de espacios. `/app/labs/[slug]/spaces/[spaceSlug]` muestra nombre, capacidad, ubicaciones y recursos del espacio. Las operaciones usan Server Actions, pero toda decisión de autorización y relación vuelve a ocurrir en los servicios y transacciones.

## Validación

Las pruebas unitarias cubren normalización y entradas inválidas. Las pruebas de integración cubren jerarquía válida, asociaciones opcionales, edición, movimientos, desactivación lógica, política de dependientes, permisos de lectura/escritura, aislamiento por laboratorio, manipulación de identificadores y FKs/checks/trigger ejecutados en PostgreSQL real.

Reservations I añade únicamente el índice UNIQUE `(id, space_id)` de Resource, necesario para la FK compuesta de sus asociaciones; no altera las reglas ni servicios de Spatial.
