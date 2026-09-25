# Primer incremento de Identity y Authorization

## Alcance implementado

Este incremento implementa el primer flujo backend completo de identidad y autorización de Labora:

```text
sesión Better Auth
  → users.id
  → laboratory_memberships
  → membership_roles
  → roles
  → role_permissions
  → permissions
  → decisión autorizada o denegada
```

No incluye interfaz de acceso, administración gráfica, módulos operativos, OIDC, AWS, SES, MFA ni el plugin Organization de Better Auth.

## Persistencia

La migración incremental `drizzle/0001_reflective_shriek.sql` agrega:

| Tabla                    | Responsabilidad                                               |
| ------------------------ | ------------------------------------------------------------- |
| `laboratories`           | Unidad operativa y ámbito de autorización.                    |
| `laboratory_memberships` | Relación única y activable entre un usuario y un laboratorio. |
| `roles`                  | Catálogo común de roles de aplicación.                        |
| `permissions`            | Catálogo común de capacidades atómicas.                       |
| `membership_roles`       | Asignación de varios roles a una membresía, sin duplicados.   |
| `role_permissions`       | Composición de permisos de cada rol, sin duplicados.          |

Todas las identidades usan UUID nativo. Las FKs tienen `ON DELETE RESTRICT`; la desactivación conserva el historial. La restricción única `(user_id, laboratory_id)` impide membresías duplicadas y las PK compuestas protegen las asignaciones de rol y permiso.

La revisión manual encontró seis `CREATE TABLE`, seis claves foráneas, dos PK compuestas, tres índices únicos y cuatro índices de apoyo. No contiene `DROP`, modificaciones de las tablas de autenticación, datos, extensiones ni operaciones destructivas. Se aplicó correctamente a PostgreSQL local después de esa revisión.

## Catálogo mínimo

Sólo se introdujeron capacidades necesarias para demostrar el flujo:

- `laboratory.read`: consultar los datos básicos del laboratorio autorizado.
- `laboratory.membership.manage`: administrar membresías dentro del laboratorio autorizado.
- `laboratory.role.assign`: asignar roles a membresías del laboratorio autorizado.

El bootstrap crea `laboratory_responsible` con esos tres permisos. No concede permisos operativos ni privilegios sobre otros laboratorios. Los roles no se guardan en `users`, cuentas o sesiones de Better Auth.

## Servicio de autorización

`AuthorizationService` recibe `actorUserId`, `laboratoryId` y el permiso requerido. Una sola lectura acotada al laboratorio obtiene el usuario, la membresía, sus roles y la unión de permisos. El servicio comprueba usuario, laboratorio y membresía activos, exige el permiso y deniega por defecto con un error uniforme.

Los casos de uso pueden aportar una restricción adicional sin reemplazar la comprobación base. `GetLaboratory` demuestra una consulta protegida. `AssignMembershipRole` impide asignar un rol a una membresía perteneciente a otro laboratorio y vuelve a comprobar actor, membresía y permiso dentro de su transacción con bloqueo de las filas relevantes. React, la UI y Better Auth no participan en la decisión de negocio.

## Bootstrap de desarrollo

Con PostgreSQL iniciado, las migraciones aplicadas y `.env` configurado:

```bash
pnpm bootstrap:development
```

El comando solicita interactivamente nombre, correo, laboratorio, slug y contraseña. La contraseña se lee sin eco y nunca se acepta como argumento de línea de comandos. No se guarda en archivos ni logs.

El procedimiento:

1. obtiene un advisory lock transaccional de PostgreSQL;
2. comprueba que identidad, laboratorios, membresías, roles y permisos estén vacíos;
3. usa una instancia interna no publicada de Better Auth para crear la identidad y el hash de contraseña;
4. crea el laboratorio, el rol inicial, los tres permisos, la membresía y sus asignaciones;
5. finaliza sin crear una sesión.

La instancia pública conserva `disableSignUp: true`. Una segunda ejecución se detiene antes de crear otra identidad. Si Better Auth alcanzara a crear la identidad pero fallara la transacción de dominio, una nueva ejecución también se detendría de forma segura; ese estado parcial requiere diagnóstico manual y nunca habilita responsables repetidos.

## Pruebas con PostgreSQL

```bash
pnpm test:integration
```

Las pruebas usan `TEST_DATABASE_URL`. Si se omite, derivan una base con sufijo `_test` desde `DATABASE_URL`, la crean localmente si hace falta y aplican las migraciones. El nombre debe terminar en `_test` y nunca puede coincidir con la base de desarrollo. Sólo generan datos aleatorios con dominios `invalid.test` y limpian las filas al finalizar.

Se comprueban:

- autorización con usuario y membresía activos;
- rechazo sin permiso, con membresía inactiva o usuario inactivo;
- unión de permisos de varios roles de una misma membresía;
- aislamiento de roles entre laboratorios;
- ausencia de revelación al cambiar `laboratoryId`;
- restricciones físicas de membresía y rol duplicados;
- rechazo de relaciones de membresía pertenecientes a otro laboratorio;
- bootstrap único, hash gestionado por Better Auth, inicio de sesión, recuperación de `actorUserId` desde la sesión y autorización posterior.

## Limitaciones pendientes

- No hay UI ni endpoints de administración de membresías.
- El catálogo completo de permisos se agregará por caso de uso; estos tres permisos no anticipan módulos operativos.
- Falta auditoría persistente de cambios de membresías y roles.
- El bootstrap está limitado al desarrollo local; un procedimiento de despliegue requerirá controles operativos específicos.
- No se implementaron recuperación de contraseña, proveedor de correo, OIDC ni MFA.

## Resultados de validación

Validación ejecutada el 24 de septiembre de 2026:

- `pnpm db:migrate`: correcto; PostgreSQL local registra dos migraciones aplicadas.
- Base de desarrollo después de migrar: cero usuarios, laboratorios, membresías, roles y permisos; el bootstrap real no fue ejecutado.
- `pnpm auth:check`: correcto.
- `pnpm check`: correcto; ESLint, TypeScript, 14 pruebas unitarias/configuración y Prettier finalizaron sin errores.
- `pnpm test:integration`: correcto; 12 pruebas contra PostgreSQL, incluidos los nueve escenarios de autorización y el bootstrap completo.
- `pnpm exec next build --webpack`: correcto; compilación de producción y Route Handler de Better Auth válidos.
- `pnpm build` con Turbopack no concluyó en el entorno aislado porque PostCSS recibió `EPERM` al intentar enlazar un puerto local. No alcanzó un error del código y el build equivalente con Webpack sí finalizó.
- Este incremento no modificó `docs/srs/PoliLabs-SRS.tex` ni alteró las decisiones de los ADR aceptados.
