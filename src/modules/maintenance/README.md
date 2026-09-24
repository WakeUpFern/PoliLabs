# maintenance

Estado: pendiente de implementación; este directorio delimita responsabilidades.

Bitácoras por recurso y materiales utilizados (SRS §15). Cambios de estado afectan disponibilidad; coordinación con consumos pendiente de definir.

Al iniciar el módulo, crear `domain/` para reglas puras y `application/` para casos de uso, autorización, validación y coordinación transaccional. Añadir adaptadores de persistencia solo cuando exista un caso de uso. No importar React, Next.js ni SDK de IA en el dominio.
