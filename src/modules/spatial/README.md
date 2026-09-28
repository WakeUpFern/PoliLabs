# spatial

Estado: Spatial I y Spatial II implementados.

Espacios, planos, ubicaciones jerárquicas y recursos físicos (SRS §12). Space puede ser reservable; Location organiza la posición física; Resource aporta identidad individual.

El dominio mantiene reglas puras; los servicios de aplicación coordinan autorización y validación, y los adaptadores Drizzle revalidan escrituras dentro de transacciones. React y Next.js permanecen fuera del dominio.

## Alcance de Spatial I

`Space` pertenece a exactamente un laboratorio y usa un slug único dentro de ese laboratorio. El catálogo registra nombre, capacidad opcional positiva y estado activo. Los casos de uso permiten consultar, crear, editar y desactivar con los permisos `space.read` y `space.manage`.

## Alcance de Spatial II

`Location` pertenece a un `Space`, admite `parent_id` opcional dentro del mismo espacio y no permite autopadre ni ciclos. `Resource` es un recurso físico individual que pertenece directamente a un `Space` y puede asociarse opcionalmente con una `Location` activa del mismo espacio. Ambos usan UUID, nombre no vacío y desactivación lógica.

Los casos de uso permiten listar, crear, editar, mover y desactivar con `location.read`, `location.manage`, `resource.read` y `resource.manage`. Una ubicación con hijos o recursos activos no se desactiva en cascada.

Quedan fuera clasificación y reservabilidad, planos, coordenadas, horarios, disponibilidad, reservaciones y la relación definitiva entre `Resource`, activos e inventario.
