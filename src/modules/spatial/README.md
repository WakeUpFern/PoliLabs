# spatial

Estado: pendiente de implementación; este directorio delimita responsabilidades.

Espacios, planos, ubicaciones jerárquicas y recursos físicos (SRS §12). Space es reservable; Location organiza la posición física; Resource aporta identidad individual.

Al iniciar el módulo, crear `domain/` para reglas puras y `application/` para casos de uso, autorización, validación y coordinación transaccional. Añadir adaptadores de persistencia solo cuando exista un caso de uso. No importar React, Next.js ni SDK de IA en el dominio.
