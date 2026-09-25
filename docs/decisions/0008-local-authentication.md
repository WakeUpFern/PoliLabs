# 0008 — Autenticación local con Better Auth

Estado: **Aceptada**

## Contexto y referencias

El SRS exige autenticación y autorización diferenciadas (RF1), permite cuentas locales para la V1 (§23.1), mantiene la autenticación desacoplada de la autorización de negocio (§23), prevé identidades externas estables (§23.3) y exige que todas las operaciones se evalúen bajo el usuario autenticado (§31). Fuente: [SRS](../srs/PoliLabs-SRS.tex).

Los ADR [0004](0004-identity-permissions.md) y [0006](0006-laboratory-scope.md) establecen que `User` es una identidad interna independiente del proveedor, que los roles pertenecen a `LaboratoryMembership` y que los servicios de aplicación resuelven permisos dentro del laboratorio solicitado.

El proyecto usa Next.js 16.3.6 con App Router, React 19.3.0, TypeScript 5.9.3, PostgreSQL 17 y Drizzle ORM 0.45.3. La prueba técnica validó Better Auth 1.7.6 con este stack.

Esta decisión aprueba la estrategia local, el esquema mínimo de autenticación y su integración técnica. No aprueba todavía membresías, roles, permisos, interfaz de acceso, proveedor de correo, AWS ni una integración institucional.

## Alternativas evaluadas

### Better Auth

- Integra Next.js App Router mediante un `Route Handler` y dispone de adaptador oficial para Drizzle y PostgreSQL.
- Incluye autenticación por correo y contraseña, hash de contraseña con `scrypt`, verificación de correo, cambio y restablecimiento de contraseña, sesiones persistentes, revocación de sesiones y limitación de solicitudes.
- Modela varias cuentas o proveedores vinculados a un usuario y ofrece proveedores OAuth/OIDC genéricos, por lo que permite agregar posteriormente un proveedor institucional sin trasladar los permisos de negocio al proveedor.
- Su modelo y extensibilidad encajan en el monolito, pero deben aislarse detrás de una integración de infraestructura. Sus plugins de organizaciones, administración y roles no deben sustituir `Laboratory`, `LaboratoryMembership`, `Role` ni `Permission`.
- La aplicación sigue siendo responsable de enviar correos, de autorizar el alta de usuarios y de aplicar todas las reglas de negocio.

### Auth.js con Credentials

- Tiene integración madura con Next.js, adaptador oficial para Drizzle y soporte amplio para OAuth/OIDC.
- Puede mantener sesiones en base de datos o mediante JWT.
- El proveedor Credentials solo entrega el flujo de autenticación: el proyecto debe implementar persistencia y verificación de contraseñas, rate limiting, recuperación, cambio de contraseña y demás ciclo de vida de credenciales.
- Esa carga aumenta el código de seguridad propio precisamente en el alcance local que necesita Labora. Sigue siendo una opción válida para aplicaciones centradas en proveedores OAuth, pero es menos adecuada para este primer incremento basado en correo y contraseña.

### Implementación propia o proveedor externo

- Una implementación completa propia ofrece control, pero obliga a mantener hash, tokens, cookies, sesiones, recuperación, enlace de cuentas y defensas contra abuso. Se rechaza mientras una biblioteca mantenida cubra estas necesidades.
- Cognito, Clerk, Auth0, Keycloak u otro proveedor podrían resolver parte del problema, pero agregan dependencia de nube, costo o infraestructura operativa. No responden al requisito de una V1 local sencilla y no se descartan para una evaluación futura concreta.

## Decisión

Usar **Better Auth 1.7.6** como componente de infraestructura para la autenticación local, con el adaptador Drizzle sobre el PostgreSQL compartido y con ejecución en el runtime Node.js de Next.js. La dependencia y su CLI quedan fijadas en el lockfile y sus actualizaciones serán deliberadas.

Usar UUID nativo de PostgreSQL para `users`, `accounts`, `sessions` y `verifications` mediante el mecanismo oficial `advanced.database.generateId: "uuid"`. PostgreSQL genera los identificadores con `pg_catalog.gen_random_uuid()` y las claves foráneas usan el mismo tipo.

Usar sesiones opacas persistidas en base de datos, no roles incrustados en JWT ni una sesión sin estado. Esto permite revocación inmediata, cierre de sesiones por dispositivo y comprobación de la cuenta activa. En el primer incremento no se habilitará caché de sesión en cookie; la optimización se evaluará solo si las mediciones la justifican.

Deshabilitar el registro público y el borrado físico. Las cuentas serán aprovisionadas por un caso de uso autorizado de Labora. La primera identidad se creará mediante un bootstrap controlado, auditable y limitado al entorno correspondiente; su procedimiento concreto se implementará por separado y no concederá un rol global de Better Auth.

Mantener el envío de correo detrás de un adaptador propio de infraestructura. No se integra todavía AWS, SES ni otro proveedor real.

### Frontera entre autenticación y dominio

`User` seguirá siendo la identidad interna única y estable de Labora. Better Auth se configurará con el esquema Drizzle revisado por el proyecto para que sus cuentas de autenticación referencien `users.id`. No se mantendrá un segundo usuario de negocio ni se usará el correo como clave relacional estable.

El modelo mínimo conceptual será:

- `User`: identidad interna y estado de acceso de Labora. Contiene el identificador estable; los atributos exigidos por la integración de autenticación deberán mantenerse mínimos.
- `AuthenticationAccount`: credencial local o identidad de proveedor, identificada por proveedor y sujeto estable, vinculada a un único `User`. La contraseña local se almacena aquí únicamente como hash gestionado por la biblioteca.
- `AuthenticationSession`: token opaco, `userId`, expiración y metadatos mínimos para administración y revocación.
- `AuthenticationVerification`: token temporal para verificación de correo, activación o recuperación, con propósito y expiración.
- `LaboratoryMembership`, `Role` y `Permission`: modelo de negocio aprobado en el ADR 0006; no forma parte del esquema de sesión de Better Auth.

Los nombres físicos aprobados son `users`, `accounts`, `sessions` y `verifications`. Toda migración futura seguirá requiriendo revisión de nombres, claves foráneas, unicidad, índices y comportamiento de borrado antes de aplicarse.

Tras validar una sesión, la integración producirá como máximo un contexto autenticado con `actorUserId` y datos técnicos de sesión. Cada servicio de aplicación deberá:

1. volver a cargar y comprobar que `User` está activo;
2. recibir o resolver el laboratorio objetivo sin confiar en un selector del cliente;
3. comprobar una `LaboratoryMembership` activa;
4. calcular permisos desde todos los roles de esa membresía;
5. aplicar las restricciones adicionales del caso de uso;
6. revalidar autorización y relaciones dentro de la operación de escritura cuando corresponda.

No se guardarán roles, permisos ni un laboratorio autoritativo en la sesión. Un laboratorio seleccionado puede conservarse como preferencia de interfaz, pero nunca acredita acceso. Desactivar una membresía corta el acceso a ese laboratorio en la siguiente operación sin cerrar necesariamente las sesiones válidas para otros laboratorios. Desactivar un `User` revoca todas sus sesiones y bloquea cualquier nueva autenticación.

### OIDC y vinculación futura

Una identidad institucional futura se representará como otra `AuthenticationAccount` del mismo `User`, usando la combinación estable de proveedor/emisor y sujeto (`sub`), no solo el correo. El historial, las membresías y los roles permanecen asociados a `users.id`.

No se permitirá crear o vincular automáticamente una cuenta de negocio únicamente por coincidencia de correo. El enlace requerirá una sesión ya autenticada o un proceso administrativo explícito que compruebe la identidad y evite que un proveedor se vincule a dos usuarios. La autoalta mediante OIDC quedará deshabilitada hasta que exista una política institucional aprobada.

## Requisitos de seguridad iniciales

### Contraseñas y recuperación

- Usar el hash mantenido por Better Auth. Su opción predeterminada es `scrypt`; antes del despliegue se comprobarán sus parámetros y rendimiento con Node.js 24 frente a las recomendaciones vigentes de OWASP. Solo se configurará Argon2id mediante una biblioteca mantenida si esa revisión lo justifica.
- Aceptar contraseñas o frases de paso de 15 a 128 caracteres mientras sean el único factor, permitir gestores de contraseñas y pegado, evitar reglas arbitrarias de composición y rechazar contraseñas conocidas o previsibles mediante una lista de bloqueo apropiada.
- No registrar contraseñas, hashes, tokens, secretos ni URLs completas de recuperación. Los secretos de configuración estarán fuera del repositorio y sus nombres se documentarán en `.env.example` al implementar.
- Responder igual exista o no la cuenta en los flujos de recuperación. Los tokens serán aleatorios, de un solo uso, almacenados de forma segura y con caducidad corta.
- Restablecer la contraseña revocará todas las sesiones. Cambiarla desde una sesión válida requerirá la contraseña actual y revocará las demás sesiones.
- La entrega de verificación y recuperación se realizará mediante un adaptador de correo. Para desarrollo se podrá usar un buzón local como Mailpit; el proveedor del despliegue real queda pendiente. No se imprimirán tokens en logs como sustituto.

### Sesiones y rutas

- Usar cookies `HttpOnly`, `Secure` en producción, `SameSite=Lax`, limitadas al host y con el alcance de ruta mínimo. No habilitar cookies entre subdominios sin necesidad concreta.
- Usar una sesión de base de datos con máximo de 12 horas y sin renovación deslizante. Las operaciones sensibles exigirán autenticación reciente cuando el caso de uso lo requiera.
- Permitir listar y revocar sesiones propias. Cerrar sesión elimina la sesión actual; desactivar una cuenta, recuperar la contraseña o detectar compromiso revoca todas.
- En Next.js 16, `proxy.ts` puede hacer redirecciones optimistas, pero no será la barrera de seguridad. Server Components, Server Actions, Route Handlers y herramientas de Giussepe validarán la sesión en servidor antes de invocar servicios.
- Mantener los endpoints de autenticación y las operaciones de negocio en el runtime Node.js, adecuado para Drizzle, PostgreSQL y criptografía. No introducir Edge runtime sin una necesidad específica.

### Entradas, abuso y privilegios

- Usar las validaciones de Better Auth para sus contratos y validación explícita en servidor para entradas de aplicación. Normalizar el correo para unicidad sin tratarlo como identificador inmutable.
- Configurar límites estrictos para inicio de sesión, alta, verificación y recuperación; las respuestas no revelarán si existe un usuario. Definir correctamente la IP confiable detrás del proxy de despliegue.
- Mantener protección CSRF, comprobación de origen y orígenes confiables de la biblioteca. No desactivar verificaciones de estado OIDC ni ampliar orígenes para resolver errores de configuración.
- No usar el plugin de organizaciones ni los roles administrativos de Better Auth como autorización de Labora. Tampoco exponer sus operaciones administrativas directamente al cliente: cualquier alta, revocación o enlace privilegiado atravesará un servicio de aplicación y auditoría.
- No habilitar borrado físico de usuarios en el primer incremento. La desactivación conserva relaciones e historial. Los cambios de credenciales, enlaces de proveedor y revocaciones relevantes se auditarán sin guardar secretos.

## Primer incremento funcional propuesto

El primer incremento deberá demostrar el límite completo entre autenticación y autorización con el menor flujo útil:

- aprovisionar un `User` local mediante un servicio autorizado, una vez resuelto el mecanismo del primer responsable;
- entregar activación o recuperación a través del adaptador de correo local;
- iniciar y cerrar sesión con correo y contraseña;
- cambiar y recuperar la contraseña con revocación de sesiones;
- mostrar al usuario autenticado su perfil básico y los laboratorios donde mantiene una membresía activa;
- entrar al contexto de un laboratorio y ejecutar una consulta mínima autorizada con permisos obtenidos de los roles de esa membresía;
- desactivar una membresía sin afectar el acceso del mismo usuario a otro laboratorio, y desactivar el usuario revocando todo acceso.

Quedan fuera de este incremento el registro público, OIDC institucional, MFA, administración completa de roles, delegación de roles, organizaciones de Better Auth, personalización avanzada de sesiones, autenticación de Giussepe y cualquier módulo operativo ajeno a identidad.

Los criterios de aceptación deberán demostrar que una cookie inventada o una redirección superada no autoriza operaciones; una sesión expirada o revocada se rechaza; roles de otro laboratorio no se agregan; una membresía sin roles no concede permisos; y ningún rol o permiso de negocio se toma de Better Auth.

## Estrategia de implementación incremental

Esta secuencia orienta incrementos posteriores; la aceptación de este ADR no amplía el alcance de implementación actual.

1. **Prueba técnica aislada:** fijar una versión de Better Auth compatible con Next.js 16, Drizzle 0.45 y Node.js 24; revisar su esquema generado, parámetros de `scrypt`, comportamiento transaccional y cookies. Desechar la prueba si obliga a duplicar `User` o a mezclar roles globales.
2. **Modelo mínimo:** definir `User`, cuentas de autenticación, sesiones y verificaciones junto con las restricciones del ADR 0006 necesarias para una sola membresía inicial. Revisar el SQL antes de crear una migración.
3. **Casos de uso de cuenta:** aprovisionamiento autorizado, activación/verificación, inicio y cierre de sesión, cambio y recuperación de contraseña, desactivación y revocación. Sin autoservicio de alta.
4. **Contexto autenticado:** adaptar la sesión a `actorUserId` y construir servicios que nieguen por defecto. Probar que ninguna propiedad de sesión concede permisos de laboratorio.
5. **Primer corte de autorización:** resolver una membresía activa con varios roles y permisos para una operación mínima de solo lectura. Probar varios laboratorios, membresías inactivas, ausencia de roles e identificadores ajenos.
6. **OIDC posterior:** agregar el proveedor institucional solo con autorización, configuración de emisor/cliente y política de enlace aprobadas. Probar que el enlace conserva el mismo `User` y su historial.

Las pruebas deberán cubrir hash y validación de contraseña, enumeración de cuentas, expiración y revocación, tokens de un solo uso, CSRF/orígenes, usuario inactivo, membresía inactiva, aislamiento entre laboratorios, varios roles y enlace de proveedor duplicado. Las pruebas de integración usarán PostgreSQL real para restricciones y transacciones.

## Riesgos y decisiones pendientes

- Diseñar el procedimiento operativo del bootstrap controlado, incluida su desactivación después del primer uso, sin introducir un superusuario con acceso implícito a todos los laboratorios.
- Definir el proveedor de correo del despliegue y el procedimiento de recuperación cuando el usuario pierde también acceso a su correo; el adaptador debe permanecer desacoplado y no presupone AWS.
- Precisar qué operaciones exigen autenticación reciente y la política para dispositivos compartidos del Laboratorio de Pesados.
- Elegir y mantener la lista de contraseñas bloqueadas y el mecanismo de protección contra abuso para una futura ejecución con varias instancias.
- Precisar las operaciones auditables de identidad, su retención y quién puede consultarlas.
- Revisar si el alta de `User` y su credencial puede coordinarse atómicamente con la API y los hooks de la versión seleccionada. No aceptar estados parciales silenciosos.
- Definir la política institucional de enlace, recuperación y resolución de cuentas duplicadas antes de habilitar OIDC.

## Consecuencias

La decisión reduce el código criptográfico y de ciclo de vida de credenciales mantenido por Labora, conserva desarrollo local sin AWS y deja una ruta hacia OIDC. A cambio, introduce una dependencia estructural cuyo esquema, actualizaciones y mecanismos administrativos deberán aislarse y revisarse.

La sesión identificará al actor, pero nunca será evidencia suficiente de permisos de negocio. PostgreSQL y los servicios de aplicación continuarán siendo la autoridad para el estado del usuario, membresías, roles, permisos y restricciones específicas.

La validación con Better Auth 1.7.6, el esquema UUID revisado, la migración aplicada y las pruebas reales contra PostgreSQL se documentan en [Validación técnica de autenticación local](../architecture/authentication-spike.md).

## Fuentes técnicas consultadas

- [Better Auth: integración con Next.js](https://better-auth.com/docs/integrations/next)
- [Better Auth: adaptador Drizzle](https://better-auth.com/docs/adapters/drizzle)
- [Better Auth: correo y contraseña](https://better-auth.com/docs/authentication/email-password)
- [Better Auth: sesiones](https://better-auth.com/docs/concepts/session-management)
- [Better Auth: usuarios, cuentas y vinculación](https://better-auth.com/docs/concepts/users-accounts)
- [Better Auth: OAuth/OIDC genérico](https://better-auth.com/docs/plugins/generic-oauth)
- [Auth.js: Credentials](https://authjs.dev/getting-started/authentication/credentials)
- [Auth.js: adaptador Drizzle](https://authjs.dev/getting-started/adapters/drizzle)
- [Auth.js: estrategias de sesión](https://authjs.dev/concepts/session-strategies)
- [OWASP: almacenamiento de contraseñas](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
- [OWASP: recuperación de contraseña](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html)
- [NIST SP 800-63B-4](https://pages.nist.gov/800-63-4/sp800-63b.html)
