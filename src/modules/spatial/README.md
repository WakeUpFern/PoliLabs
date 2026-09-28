# spatial

Estado: Spatial I implementa el catálogo de espacios por laboratorio.

Espacios, planos, ubicaciones jerárquicas y recursos físicos (SRS §12). Space puede ser reservable; Location organiza la posición física; Resource aporta identidad individual.

Al iniciar el módulo, crear `domain/` para reglas puras y `application/` para casos de uso, autorización, validación y coordinación transaccional. Añadir adaptadores de persistencia solo cuando exista un caso de uso. No importar React, Next.js ni SDK de IA en el dominio.

## Alcance de Spatial I

`Space` pertenece a exactamente un laboratorio y usa un slug único dentro de ese laboratorio. El catálogo registra nombre, capacidad opcional positiva y estado activo. Los casos de uso permiten consultar, crear, editar y desactivar con los permisos `space.read` y `space.manage`.

Quedan fuera de este incremento las ubicaciones jerárquicas, planos, recursos individuales, horarios, disponibilidad y reservaciones. Que un espacio sea reservable y su clasificación se modelarán cuando esos casos de uso requieran reglas concretas.
