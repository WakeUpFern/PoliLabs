# inventory

Estado: pendiente de implementación; este directorio delimita responsabilidades.

Ítems, existencias por ubicación, movimientos y préstamos (SRS §14). Distinguir cantidad, unidad, identidad individual y préstamo temporal.

Al iniciar el módulo, crear `domain/` para reglas puras y `application/` para casos de uso, autorización, validación y coordinación transaccional. Añadir adaptadores de persistencia solo cuando exista un caso de uso. No importar React, Next.js ni SDK de IA en el dominio.
