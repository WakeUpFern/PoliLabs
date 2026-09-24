# knowledge

Estado: pendiente de implementación; este directorio delimita responsabilidades.

Metadatos, asociaciones y permisos de documentos (SRS §18). Binarios en S3 en una etapa posterior.

Al iniciar el módulo, crear `domain/` para reglas puras y `application/` para casos de uso, autorización, validación y coordinación transaccional. Añadir adaptadores de persistencia solo cuando exista un caso de uso. No importar React, Next.js ni SDK de IA en el dominio.
