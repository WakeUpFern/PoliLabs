# audit

Estado: pendiente de implementación; este directorio delimita responsabilidades.

Historial de operaciones relevantes y origen WEB, API, AGENT o SYSTEM (SRS §25).

Al iniciar el módulo, crear `domain/` para reglas puras y `application/` para casos de uso, autorización, validación y coordinación transaccional. Añadir adaptadores de persistencia solo cuando exista un caso de uso. No importar React, Next.js ni SDK de IA en el dominio.
