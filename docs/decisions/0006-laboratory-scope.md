# 0006 — Alcance organizacional y membresías de laboratorio

Estado: **Aceptada**

## Contexto y referencias

El SRS establece crecimiento hacia varios laboratorios (RNF8), espacios físicos reservables (§12), usuarios independientes del proveedor de autenticación (§23), roles compuestos por permisos (§24) y servicios compartidos por web e IA (§§20–21, 31). El modelo sugerido incluye `spaces.organization_id` sin definir organizaciones ni membresías (§22). Fuente: [SRS](../srs/PoliLabs-SRS.tex).

La separación entre unidad operativa y espacio físico, la postergación de Organization y el modelo de membresías son decisiones aprobadas por el responsable del proyecto; no se presentan como requisitos textuales del SRS. El original permanece sin modificaciones.

## Decisión

Mantener una base PostgreSQL compartida e introducir conceptualmente:

- `Laboratory`: unidad operativa y ámbito de autorización.
- `Space`: lugar físico potencialmente reservable, perteneciente a un único laboratorio. Un laboratorio puede administrar varios espacios.
- `User`: identidad interna única, independiente de los laboratorios.
- `LaboratoryMembership`: relación única usuario–laboratorio, con estado activo/inactivo y posibilidad de varios roles.
- `Role` y `Permission`: roles compuestos por permisos. Los roles se asignan a la membresía, no globalmente al usuario. El catálogo inicial de roles y permisos es común y controlado por la aplicación; no implica permisos globales sobre datos.

La relación entre membresías y roles es de muchos a muchos, sin asignaciones duplicadas. Una membresía sin roles no concede permisos de negocio. Los permisos de los roles de la membresía forman las capacidades disponibles en ese laboratorio, sujetas siempre a las restricciones del caso de uso. No se agregan permisos de membresías de otros laboratorios.

Posponer `Organization` y no materializar todavía el `organization_id` sugerido por el SRS. Cuando exista una necesidad institucional concreta, podrá añadirse como agrupación de laboratorios mediante una migración, conservando las membresías locales. Esto no presupone que el aislamiento entre instituciones independientes quede resuelto.

### Relaciones operativas

Cada espacio pertenece a un laboratorio; recursos y ubicaciones conservan ese alcance mediante su espacio. Los padres de una ubicación deben conservar el mismo contexto. Las prácticas pertenecen a un laboratorio y sus sesiones utilizan espacios de ese mismo laboratorio. Una reservación corresponde a un espacio y solo puede asignar recursos de ese espacio, con referencias compatibles a práctica y sesión.

No se comparten inicialmente espacios, prácticas ni operaciones entre laboratorios. La reserva exclusiva de un espacio bloquea sus recursos, no automáticamente todos los espacios de la unidad operativa.

Cada registro operativo debe tener un alcance de laboratorio inequívoco, directo o mediante relaciones obligatorias. Una ubicación opcional no puede ser la única forma de determinar el laboratorio de inventario. Al diseñar tablas, evitar duplicar `laboratory_id` sin necesidad y proteger con restricciones cualquier redundancia necesaria.

### Alumno y ayudante simultáneamente

Una persona puede ser alumno y prestar servicio social en el mismo laboratorio: una cuenta, una membresía y varios roles, por ejemplo `student` y `lab_assistant`. La participación en materias, grupos y sesiones se representa mediante relaciones académicas independientes.

Los horarios de servicio y la autorización son conceptos separados. No se introduce activación automática de permisos por hora ni un módulo de servicio social. La combinación de roles no elimina las restricciones sobre registros propios: las operaciones académicas deberán definir controles que impidan utilizar privilegios de ayudante para intervenir indebidamente en la propia asistencia u otros registros académicos. Las políticas específicas se definirán al implementar cada caso de uso.

### Autorización y aislamiento

Los servicios de aplicación deben:

1. Obtener el actor del contexto autenticado y denegar por defecto.
2. Verificar usuario y membresía activos y el permiso requerido en el laboratorio solicitado. Un selector o identificador enviado por el cliente no acredita autorización.
3. Acotar consultas y escrituras al laboratorio autorizado y comprobar las relaciones entre las entidades involucradas. Tener acceso a dos laboratorios no autoriza asociaciones cruzadas.
4. Aplicar restricciones adicionales del caso de uso, incluidas propiedad y participación académica. La membresía no da acceso a todos los datos.
5. Revalidar condiciones y autorización en operaciones diferidas, coordinándolas con la transacción de escritura.
6. Aplicar el mismo alcance a listados, búsquedas, conteos, exportaciones, documentos, cachés y notificaciones.
7. Auditar actor, laboratorio y origen de operaciones relevantes y cambios de permisos. Desactivar una membresía impide nuevas operaciones sin borrar su historial.

Administrar recursos no concede administración de membresías. La delegación de roles debe requerir un permiso específico y límites sobre qué roles pueden concederse. La creación de laboratorios y asignación del primer responsable necesitan un mecanismo de administración de plataforma separado; no se presume un superusuario con acceso automático a todos los datos.

El futuro asistente utiliza estos mismos servicios bajo la identidad del usuario. El contexto conversacional no acredita permisos; cualquier cambio de laboratorio debe autorizarse y las ambigüedades deben resolverse con el usuario o mediante alternativas autorizadas. Búsquedas documentales y memoria también deben respetar el alcance. Las acciones se auditan con origen `AGENT`.

## Alternativas consideradas

- **Space como único laboratorio:** reduce entidades, pero mezcla alcance administrativo y distribución física, complicando laboratorios con varias salas.
- **Organization desde el MVP:** facilitaría administración institucional, pero faltan procesos que la justifiquen y no está definido si representa IPN, UPIITA u otra unidad.
- **Una base por laboratorio:** mejora separación física, pero duplica operación y complica identidades compartidas.
- **Un rol por membresía:** fue la propuesta inicial; se ajustó antes de su aceptación porque una misma persona puede ser alumno y ayudante simultáneamente.
- **RLS desde el inicio:** puede añadir defensa en profundidad, pero requiere políticas y contexto por conexión. Se pospone; los servicios y las restricciones relacionales deben sostener el aislamiento inicial y contar con pruebas.

## Consecuencias

Queda resuelta la decisión conceptual que bloqueaba el modelado inicial de identidad y espacios. La aprobación no equivale a implementación: no hay tablas, migraciones, autenticación ni autorización ejecutable introducidas por este ADR.

Siguen pendientes el mecanismo de altas y primer responsable, proveedor de autenticación, matriz concreta de permisos y delegación, reglas académicas sobre registros propios y diseño físico de las restricciones. Se definirán con sus respectivos incrementos, sin anticipar una arquitectura multiinstitucional.

La implementación deberá demostrar aislamiento ante identificadores ajenos, listados y exportaciones; permisos distintos para un usuario en varios laboratorios; rechazo de relaciones cruzadas; revocación de membresías; y aplicación de restricciones académicas aunque existan varios roles.

## Historial

El ADR comenzó como propuesta abierta sobre organizaciones, laboratorios y membresías. El responsable aprobó la separación Laboratory–Space, posponer Organization y limitar cada actividad inicialmente a un laboratorio. Tras revisar el caso de alumnos que también prestan servicio social, aprobó varios roles por membresía y solicitó registrar la solución. Se acepta este mismo ADR; no reemplaza una decisión previamente aceptada.
