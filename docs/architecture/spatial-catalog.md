# Catálogo de espacios — Spatial I

Estado: implementado.

## Alcance

Spatial I introduce `Space` como catálogo operativo perteneciente a un único `Laboratory`, conforme al SRS §12 y al ADR 0006. Cada espacio tiene UUID, nombre, slug local al laboratorio, capacidad opcional positiva y estado activo. La unicidad se protege con `(laboratory_id, slug)` y la desactivación es lógica.

Este corte no modela `Location`, planos, recursos físicos individuales, tipo de espacio, horarios, disponibilidad ni reservaciones. El SRS describe esas capacidades, pero sus reglas se incorporarán con los casos de uso que las necesiten.

## Autorización y escritura

- `space.read` consulta únicamente espacios activos del laboratorio autorizado.
- `space.manage` crea, edita y desactiva espacios del mismo laboratorio.
- Los casos de uso reutilizan `AuthorizationService`.
- Las escrituras revalidan usuario, membresía, laboratorio y permiso dentro de la transacción que modifica el catálogo, evitando confiar sólo en la verificación previa de presentación.
- Una ruta o un slug nunca conceden acceso por sí mismos.

La migración de Spatial I agrega ambos permisos al catálogo y los asigna al rol inicial `laboratory_responsible` cuando ya existe. El bootstrap también los incluye en instalaciones nuevas.

## Persistencia e interfaz

PostgreSQL protege la clave foránea al laboratorio, el slug válido, el nombre no vacío, la capacidad positiva y la unicidad local. La interfaz `/app/labs/[slug]/spaces` lista espacios activos y, para actores con `space.manage`, permite alta, edición y desactivación mediante Server Actions que vuelven a autenticar y autorizar la operación.

## Validación

Las pruebas unitarias cubren normalización y valores inválidos. Las pruebas de integración cubren creación, duplicados, aislamiento entre laboratorios, edición, desactivación lógica y restricciones de capacidad en PostgreSQL.
