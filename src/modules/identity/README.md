# identity

Estado: primer incremento backend implementado.

Identidad interna, roles y permisos, desacoplados de proveedores de autenticación (SRS §§23–24).

`domain/` contiene el catálogo mínimo y errores; `application/` resuelve autorización, consulta protegida, asignación de roles y bootstrap; `infrastructure/` integra Drizzle, PostgreSQL y Better Auth. El dominio no importa React, Next.js, Drizzle ni SDK de IA.
