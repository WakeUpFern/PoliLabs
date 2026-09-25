# Shell autenticado y selección de laboratorio

## Alcance implementado

Este incremento añade la primera interfaz funcional de autenticación y el shell protegido de Labora sin cambiar el esquema ni las decisiones de los ADR 0004, 0006 y 0008:

```text
/login
  → Better Auth
  → sesión opaca en PostgreSQL
  → actorUserId
  → usuario activo
  → memberships activas
  → selección de Laboratory
  → AuthorizationService
  → shell autorizado
```

La presentación usa Tailwind y componentes propios pequeños. No se añadió shadcn/ui porque los formularios y botones actuales no justifican todavía otra dependencia.

## Login y estado de cuenta

`/login` usa el cliente React oficial de Better Auth para enviar correo y contraseña a `/api/auth/sign-in/email`. El formulario muestra carga y un mensaje uniforme cuando las credenciales son inválidas o la cuenta no puede iniciar sesión; no confirma si el correo existe.

La creación de una sesión ejecuta un hook de infraestructura que consulta `users.is_active`. Una cuenta inactiva recibe el mismo error público que unas credenciales inválidas. Además, toda entrada a `/app` vuelve a cargar el usuario activo: una sesión persistida no constituye autorización ni evita esa comprobación. Si una cuenta se desactiva mientras conserva una cookie, la UI la devuelve a `/login`, limpia la sesión del navegador y no muestra datos protegidos.

No hay registro público, recuperación, MFA, OIDC ni proveedores sociales.

## Protección de rutas y actor

El layout servidor de `/app` llama `auth.api.getSession` con los headers de la solicitud. Una sesión ausente, expirada o revocada redirige a `/login`. La sesión se reduce a `actorUserId`; roles, permisos y laboratorio no se aceptan desde el cliente ni se guardan como autoridad en la sesión.

La protección no depende de `proxy.ts` o middleware. Cada página servidor protegida obtiene el actor validado antes de ejecutar un caso de uso. Las mutaciones de credenciales continúan protegidas por los endpoints autenticados y las defensas de origen de Better Auth.

## Laboratorios y autorización

`GetUserLaboratories` y `DrizzleUserLaboratoriesReader` devuelven únicamente laboratorios activos vinculados a membresías activas de un usuario activo. Los roles se obtienen de esa membresía concreta; no se agregan roles de otros laboratorios.

La navegación usa `/app/labs/[slug]`. El slug expresa intención, no acceso. `GetLaboratoryBySlug` resuelve un laboratorio activo y después exige `laboratory.read` mediante el `AuthorizationService` existente. Laboratorio inexistente, membresía ajena, membresía inactiva, usuario inactivo y falta de permiso producen la misma respuesta pública de no encontrado, por lo que editar la URL no revela existencia ni datos.

El dashboard inicial muestra solamente nombre de laboratorio, usuario y roles de la membresía. Los módulos operativos aparecen deshabilitados y no muestran estadísticas inventadas.

## Logout y cambio de contraseña

Logout usa `authClient.signOut()`: Better Auth elimina la sesión actual y la UI vuelve a `/login`.

El cambio de contraseña está en `/app/account/security`, exige una sesión válida, la contraseña actual y una contraseña nueva de 15 a 128 caracteres. Usa `authClient.changePassword` de Better Auth 1.7.6; Labora no implementa hash ni acceso a credenciales.

La política implementada es `revokeOtherSessions: true`. Better Auth elimina las sesiones existentes y emite un token sustituto para el navegador que realizó el cambio. En consecuencia, ese navegador permanece autenticado mediante una sesión rotada y todas las demás sesiones quedan invalidadas de inmediato. Es la opción sencilla y segura ya aprobada por el ADR 0008 para el MVP. Las pruebas PostgreSQL comprueban que los tokens anteriores dejan de funcionar, el token sustituto funciona y la contraseña anterior ya no autentica.

## Bootstrap manual de desarrollo

Con `.env` configurado, PostgreSQL iniciado y las migraciones aplicadas, el responsable puede crear manualmente la primera cuenta local:

```bash
pnpm bootstrap:development
```

El comando es interactivo, no recibe la contraseña como argumento, crea una única identidad local con laboratorio/membresía/rol iniciales y no inicia sesión. Este incremento no lo ejecuta automáticamente. Después se inicia `pnpm dev` y se abre `http://localhost:3000/login`.

## Limitaciones pendientes

- No hay recuperación de contraseña ni adaptador de correo.
- No hay registro público, MFA, OIDC ni proveedores sociales.
- No hay UI para crear cuentas, laboratorios, roles o membresías.
- No hay auditoría persistente del login, logout o cambio de credenciales.
- Los módulos Spatial, Resources, Inventory, Reservations, Academic, Maintenance, Incidents y Giussepe permanecen fuera de alcance.
- La desactivación administrativa de usuarios y la revocación explícita de todas sus sesiones se abordarán con el caso de uso de administración; el acceso actual ya se deniega en la siguiente solicitud y en nuevos inicios de sesión.

## Validación

Las pruebas unitarias cubren resolución de sesión a `actorUserId`, rechazo sin sesión, usuario inactivo y autorización uniforme por slug. Las pruebas de integración con PostgreSQL real cubren login válido e inválido, cuenta inactiva, memberships/laboratorios activos, aislamiento entre usuarios y laboratorios, cambio de contraseña con rotación y revocación, y logout.

Documentación técnica consultada: [Better Auth: email y contraseña](https://better-auth.com/docs/authentication/email-password), [sesiones](https://better-auth.com/docs/concepts/session-management), [integración con Next.js](https://better-auth.com/docs/integrations/next) y [hooks de base de datos](https://better-auth.com/docs/concepts/database).
