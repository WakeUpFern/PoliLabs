# reservations

Estado: pendiente de implementación; este directorio delimita responsabilidades.

Disponibilidad, reservaciones, asignaciones, recurrencias y bloqueos (SRS §13). Una reservación puede asignar múltiples recursos de su espacio y referenciar práctica o sesión.

Al iniciar el módulo, crear `domain/` para reglas puras y `application/` para casos de uso, autorización, validación y coordinación transaccional. Añadir adaptadores de persistencia solo cuando exista un caso de uso. No importar React, Next.js ni SDK de IA en el dominio.
