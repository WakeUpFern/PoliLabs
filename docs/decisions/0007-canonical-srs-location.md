# 0007 — Ubicación canónica del SRS

Estado: **Aceptada**

## Contexto y referencias

El SRS es la fuente de requisitos de Labora. La configuración inicial refería `Docs/srs/`, mientras que el responsable del proyecto confirmó explícitamente que la ubicación deliberada y existente es `docs/srs/`. Referencia: [SRS](../srs/PoliLabs-SRS.tex), en particular su alcance y requisitos generales.

## Decisión

Versionar y consultar el SRS original y su PDF en `docs/srs/`. Actualizar las referencias internas para usar esa ruta exacta. El contenido del SRS no se modifica como parte de esta decisión.

## Alternativas consideradas

Mantener referencias a `Docs/srs/` dejaría enlaces rotos y contradicción con el árbol real. Duplicar los archivos en ambas rutas introduciría dos fuentes aparentes de requisitos y riesgo de divergencia.

## Consecuencias

Las futuras consultas y enlaces deben usar `docs/srs/PoliLabs-SRS.tex`. Cualquier traslado o edición posterior del original requerirá autorización explícita; no se conserva una copia paralela solo por compatibilidad de mayúsculas.
