# incidents

Estado: pendiente de implementación; este directorio delimita responsabilidades.

Reportes, severidad, seguimiento y resolución (SRS §16). Asociación a recurso, espacio o sesión; el historial no determina culpabilidad.

Al iniciar el módulo, crear `domain/` para reglas puras y `application/` para casos de uso, autorización, validación y coordinación transaccional. Añadir adaptadores de persistencia solo cuando exista un caso de uso. No importar React, Next.js ni SDK de IA en el dominio.
