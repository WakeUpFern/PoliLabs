# knowledge

Estado: pendiente de implementación; este directorio delimita responsabilidades.

Recuperación de conocimiento sobre documentos autorizados (SRS §18, Giussepe). Los metadatos, asociaciones, permisos y el almacenamiento de objetos de Documents I viven en `modules/documents` (ADR 0016).

Al iniciar el módulo, crear `domain/` para reglas puras y `application/` para casos de uso, autorización, validación y coordinación transaccional. Añadir adaptadores de persistencia solo cuando exista un caso de uso. No importar React, Next.js ni SDK de IA en el dominio.
