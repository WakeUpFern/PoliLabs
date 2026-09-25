# Validación técnica de autenticación local

## Alcance

Esta validación integró Better Auth con Next.js App Router, Drizzle ORM y PostgreSQL. El ADR 0008 fue aceptado y la migración inicial se aplicó a la base local de desarrollo sin crear usuarios. Las membresías, roles y permisos se añadieron posteriormente en el [primer incremento de Identity y Authorization](identity-authorization.md); siguen fuera de alcance la interfaz de administración y los módulos operativos.

Versiones verificadas:

- Node.js 24.19.0 y pnpm 11.19.0 en el entorno de validación.
- Next.js 16.3.6 y React 19.3.0.
- TypeScript 5.9.3.
- Drizzle ORM 0.45.3 y Drizzle Kit 0.31.11.
- PostgreSQL 17 mediante `postgres:17-alpine`.
- Better Auth 1.7.6 y su CLI `auth` 1.7.6.

Better Auth 1.7.6 declara compatibilidad con Next.js 14–16, React 18–19, Drizzle ORM desde 0.45.2, Drizzle Kit desde 0.31.4 y `pg` 8. El lockfile resolvió el conjunto sin conflictos de pares.

## Integración

La configuración de ejecución está en `src/modules/identity/infrastructure/auth.ts`. Usa el adaptador Drizzle para PostgreSQL y el runtime Node.js del Route Handler `src/app/api/auth/[...all]/route.ts`.

Las opciones compartidas activan correo y contraseña, deshabilitan el registro público, fijan una longitud de contraseña de 15–128 caracteres y configuran sesiones persistentes de 12 horas sin renovación automática. No se configuraron proveedores OIDC, Organization, roles globales, caché de sesión en cookie ni plugins administrativos.

Los identificadores usan el mecanismo oficial `advanced.database.generateId: "uuid"`. Con PostgreSQL, Better Auth delega la generación a `pg_catalog.gen_random_uuid()` y la CLI genera columnas Drizzle `uuid` nativas.

La configuración separada `auth-schema.config.ts` existe porque la CLI de Better Auth no puede cargar `server-only`. Reutiliza las mismas opciones y el mismo esquema, crea un `Pool` perezoso y permite generar o comprobar el esquema sin abrir una conexión ni aplicar cambios a PostgreSQL.

## Esquema revisado

Better Auth generó cuatro tablas Drizzle:

| Tabla           | Responsabilidad                                                               |
| --------------- | ----------------------------------------------------------------------------- |
| `users`         | Identidad interna estable, correo, nombre, verificación y estado activo.      |
| `accounts`      | Credencial local y futuras identidades de proveedor vinculadas a `users.id`.  |
| `sessions`      | Sesiones opacas persistidas y revocables vinculadas a `users.id`.             |
| `verifications` | Tokens temporales de verificación y recuperación gestionados por Better Auth. |

Revisión de integridad:

- Todas las claves primarias son UUID nativos generados por PostgreSQL; `accounts.user_id` y `sessions.user_id` también usan UUID.
- `accounts.user_id` y `sessions.user_id` son obligatorias y referencian `users.id` con `ON DELETE CASCADE`.
- `users.email` tiene unicidad directa y un índice único adicional sobre `lower(email)` para impedir duplicados que solo difieran en mayúsculas.
- `(accounts.provider_id, accounts.account_id)` es único para impedir que una identidad de proveedor se vincule más de una vez.
- El token de sesión es único. Las búsquedas por usuario y por identificador de verificación tienen índices.
- Las fechas usan `timestamp with time zone`.
- La contraseña es nullable en `accounts` porque futuras identidades externas no tendrán contraseña local. Better Auth almacena ahí únicamente el hash de la cuenta `credential`.
- `users.is_active` es obligatorio, predeterminado a `true` y no puede recibirse desde entradas públicas de Better Auth.
- El borrado de usuario mediante la API de Better Auth está deshabilitado. El cascado permanece como defensa de integridad si en el futuro se autoriza un borrado físico explícito.

El esquema generado fue endurecido manualmente con los índices únicos y fechas con zona horaria. Ejecutar nuevamente `pnpm auth:schema` exige revisar el diff y conservar esos ajustes antes de generar otra migración.

## Identidad interna y autorización

`users` puede ser la tabla canónica de `User` de Labora; no hace falta una segunda tabla de usuario. Su `id` será la referencia estable para el historial y para las futuras entidades de dominio.

Las futuras relaciones se mantendrán fuera del modelo de Better Auth:

```text
users.id
  └── laboratory_memberships.user_id
        └── membership_roles
              └── roles
                    └── role_permissions
                          └── permissions
```

Una sesión autenticada solo resolverá `actorUserId`. Los servicios de aplicación volverán a comprobar `users.is_active`, la membresía activa del laboratorio solicitado, la unión de permisos de sus roles y las restricciones particulares del caso de uso. No se introducirán roles ni un laboratorio autoritativo en la sesión.

Una futura identidad OIDC ocupará otra fila de `accounts` vinculada al mismo `users.id`, identificada por proveedor y sujeto estable. El correo no será la clave de vinculación y la autoalta seguirá deshabilitada.

## Migración inicial aplicada

Como la migración anterior nunca se había aplicado y no existían datos, se eliminó de la historia local y Drizzle regeneró `drizzle/0000_late_devos.sql` junto con su snapshot. No se creó una migración de conversión.

La revisión manual previa confirmó que el SQL contiene exclusivamente:

1. cuatro `CREATE TABLE` para `users`, `accounts`, `sessions` y `verifications`;
2. UUID nativo con `DEFAULT pg_catalog.gen_random_uuid()` en las cuatro claves primarias;
3. UUID en las dos claves foráneas hacia `users.id`;
4. dos restricciones foráneas y los índices de consulta y unicidad aprobados.

No contiene `DROP`, `DELETE`, `UPDATE`, `TRUNCATE`, inserciones de datos, creación de extensiones, credenciales ni cambios de permisos. Después de esta revisión se ejecutó `pnpm db:migrate` contra PostgreSQL local y Drizzle registró la migración como aplicada. Además de las cuatro tablas en `public`, Drizzle creó su tabla técnica de historial en el esquema `drizzle`.

## Comandos de comprobación

- `pnpm auth:schema`: regenera el esquema base de Better Auth; siempre requiere revisión del diff.
- `pnpm auth:check`: compara la configuración con el esquema Drizzle configurado.
- `pnpm db:generate`: genera SQL de migración; no lo aplica.
- `pnpm db:migrate`: aplica las migraciones revisadas; requiere aprobación explícita.
- `pnpm test:integration`: comprueba el esquema y la conexión real de Better Auth contra PostgreSQL local.
- `pnpm check`: lint, TypeScript, pruebas y formato.
- `pnpm build`: compilación de producción de Next.js.

Sólo `pnpm db:migrate` modifica la base de datos. En esta validación se ejecutó una vez después de la aprobación y revisión manual descritas.

## Resultados de validación

Validación ejecutada el 24 de septiembre de 2026 con valores ficticios y efímeros para las variables requeridas:

- `pnpm auth:check`: correcto; la CLI de Better Auth confirmó que la configuración y el esquema Drizzle coinciden.
- `pnpm check`: correcto después del cambio UUID; ESLint, TypeScript, siete pruebas automatizadas y Prettier finalizaron sin errores.
- La prueba del Route Handler confirmó que `POST /api/auth/sign-up/email` devuelve `400` con `EMAIL_PASSWORD_SIGN_UP_DISABLED`; no abrió una conexión ni creó usuarios.
- `pnpm build`, que usa Turbopack, no pudo concluir en el entorno aislado porque su proceso de PostCSS intentó enlazar un puerto local y recibió `EPERM`. El mismo código compiló correctamente con Webpack fuera del sandbox; queda pendiente repetir el build predeterminado en un entorno sin esa restricción.
- La generación de Drizzle produjo una sola migración inicial UUID. Se revisó manualmente y se aplicó correctamente a PostgreSQL local.
- `pnpm test:integration`: correcto; verificó tablas, tipos y defaults UUID, claves foráneas, un único registro de migración y una consulta real de Better Auth mediante un intento fallido con una identidad ficticia. Las cuatro tablas quedaron con cero filas.
- `pnpm exec next build --webpack`: correcto después del cambio UUID; compiló la aplicación y confirmó `/api/auth/[...all]` como ruta dinámica Node.js.
- La revisión del diff confirmó que `docs/srs/PoliLabs-SRS.tex` no fue modificado.

Las decisiones todavía pendientes son el procedimiento operativo exacto del bootstrap controlado, el adaptador y proveedor futuro de correo, la política de autenticación reciente y la retención de auditoría. Ninguna requiere cambiar el esquema de identidad aprobado para iniciar los siguientes incrementos.
