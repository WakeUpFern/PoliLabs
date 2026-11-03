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

`/login` usa el cliente React oficial de Better Auth para enviar correo y contraseña a `/api/auth/sign-in/email`. El formulario muestra carga y un mensaje uniforme cuando las credenciales son inválidas o la cuenta no puede iniciar sesión; no confirma si el correo existe. Otros fallos tienen su propio mensaje sin revelar cuentas: demasiados intentos (429), origen no permitido (`INVALID_ORIGIN`) y servidor inalcanzable. El botón queda deshabilitado hasta que React hidrata el formulario, que además usa `method="post"`, para que un envío nativo nunca ponga las credenciales en la URL; si la hidratación no llega, un aviso sólo con CSS aparece a los pocos segundos.

En desarrollo, abrir la app desde otro dispositivo de la red local requiere listar su origen en `BETTER_AUTH_TRUSTED_ORIGINS`: Better Auth lo usa para la comprobación de origen y `next.config.ts` deriva de él `allowedDevOrigins`, sin el cual Next.js 16 bloquea los recursos de desarrollo y la página no se hidrata.

La creación de una sesión ejecuta un hook de infraestructura que consulta `users.is_active`. Una cuenta inactiva recibe el mismo error público que unas credenciales inválidas. Además, toda entrada a `/app` vuelve a cargar el usuario activo: una sesión persistida no constituye autorización ni evita esa comprobación. Si una cuenta se desactiva mientras conserva una cookie, la UI la devuelve a `/login`, limpia la sesión del navegador y no muestra datos protegidos.

No hay registro público, recuperación, MFA, OIDC ni proveedores sociales.

## Protección de rutas y actor

El layout servidor de `/app` llama `auth.api.getSession` con los headers de la solicitud. Una sesión ausente, expirada o revocada redirige a `/login`. La sesión se reduce a `actorUserId`; roles, permisos y laboratorio no se aceptan desde el cliente ni se guardan como autoridad en la sesión.

La protección no depende de `proxy.ts` o middleware. Cada página servidor protegida obtiene el actor validado antes de ejecutar un caso de uso. Las mutaciones de credenciales continúan protegidas por los endpoints autenticados y las defensas de origen de Better Auth.

## Laboratorios y autorización

`GetUserLaboratories` y `DrizzleUserLaboratoriesReader` devuelven únicamente laboratorios activos vinculados a membresías activas de un usuario activo. Los roles se obtienen de esa membresía concreta; no se agregan roles de otros laboratorios.

La navegación usa `/app/labs/[slug]`. El slug expresa intención, no acceso. `GetLaboratoryBySlug` resuelve un laboratorio activo y después exige `laboratory.read` mediante el `AuthorizationService` existente. Laboratorio inexistente, membresía ajena, membresía inactiva, usuario inactivo y falta de permiso producen la misma respuesta pública de no encontrado, por lo que editar la URL no revela existencia ni datos.

El inicio del laboratorio muestra el recorrido de la práctica (antes, durante y después) con las acciones que los permisos de la persona habilitan; no muestra estadísticas inventadas.

## Shell y navegación

Desde el [ADR 0022](../decisions/0022-laboratory-people-and-guided-navigation.md), `src/app/app/layout.tsx` sólo valida el actor. Cada sección monta el shell (`src/app/_shell/app-shell.tsx`) con la navegación que le corresponde:

- `src/app/app/(home)/layout.tsx`: «Mis laboratorios», notificaciones y contraseña, sin contexto de laboratorio.
- `src/app/app/labs/[slug]/layout.tsx`: resuelve el laboratorio con `GetLaboratoryBySlug` (que ahora devuelve también `permissionKeys`) y arma la navegación con `labNavigation`, una función pura que agrupa las secciones por fase de la práctica y elige nombres y destinos según permisos. La navegación sólo decide qué mostrar; cada página y servicio vuelve a autorizar.

El menú lateral es un `<dialog>` modal (foco atrapado, Esc, cierre al tocar fuera y al navegar); en pantallas anchas lo acompaña una barra de íconos con etiquetas accesibles.

## Logout y cambio de contraseña

Logout usa `authClient.signOut()`: Better Auth elimina la sesión actual y la UI vuelve a `/login`.

El cambio de contraseña está en `/app/account/security`, exige una sesión válida, la contraseña actual y una contraseña nueva de 15 a 128 caracteres. Usa `authClient.changePassword` de Better Auth 1.7.6; Labora no implementa hash ni acceso a credenciales.

La política implementada es `revokeOtherSessions: true`. Better Auth elimina las sesiones existentes y emite un token sustituto para el navegador que realizó el cambio. En consecuencia, ese navegador permanece autenticado mediante una sesión rotada y todas las demás sesiones quedan invalidadas de inmediato. Es la opción sencilla y segura ya aprobada por el ADR 0008 para el MVP. Las pruebas PostgreSQL comprueban que los tokens anteriores dejan de funcionar, el token sustituto funciona y la contraseña anterior ya no autentica.

## Bootstrap manual de desarrollo

Con `.env` configurado, PostgreSQL iniciado y las migraciones aplicadas, el responsable puede crear manualmente la primera cuenta local:

```bash
pnpm bootstrap:development
```

El comando es interactivo, no recibe la contraseña como argumento, crea una única identidad local con laboratorio/membresía/rol iniciales y no inicia sesión. Reutiliza los permisos y roles que sembraron las migraciones; sólo se niega si ya existen usuarios, laboratorios o membresías. Este incremento no lo ejecuta automáticamente. Después se inicia `pnpm dev` y se abre `http://localhost:3000/login`.

## Limitaciones pendientes

- No hay recuperación de contraseña ni adaptador de correo.
- No hay registro público, MFA, OIDC ni proveedores sociales.
- La UI permite crear cuentas y membresías con un rol del catálogo («Personas», ADR 0022), pero no crear laboratorios ni roles nuevos.
- No hay auditoría persistente del login, logout o cambio de credenciales.
- Los módulos Spatial, Resources, Inventory, Reservations, Academic, Maintenance, Incidents y Giussepe permanecen fuera de alcance.
- «Quitar acceso» desactiva la membresía del laboratorio; la cuenta global (`users.is_active`) no tiene todavía una pantalla. Emitir una contraseña temporal sí revoca todas las sesiones de esa persona.

## Validación

Las pruebas unitarias cubren resolución de sesión a `actorUserId`, rechazo sin sesión, usuario inactivo y autorización uniforme por slug. Las pruebas de integración con PostgreSQL real cubren login válido e inválido, cuenta inactiva, memberships/laboratorios activos, aislamiento entre usuarios y laboratorios, cambio de contraseña con rotación y revocación, y logout.

Documentación técnica consultada: [Better Auth: email y contraseña](https://better-auth.com/docs/authentication/email-password), [sesiones](https://better-auth.com/docs/concepts/session-management), [integración con Next.js](https://better-auth.com/docs/integrations/next) y [hooks de base de datos](https://better-auth.com/docs/concepts/database).
