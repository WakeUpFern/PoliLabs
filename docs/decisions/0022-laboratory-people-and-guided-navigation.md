# 0022 — Personas del laboratorio, catálogo de roles y navegación guiada

Estado: **Propuesta** (3 de noviembre de 2026; implementada a petición del responsable para que el profesor encargado pueda empezar a usar Labora, pendiente de aprobación explícita del catálogo de roles y del diseño)

## Contexto

Hasta ahora no había forma de dar acceso a nadie: `pnpm bootstrap:development` crea una sola cuenta, el registro público está deshabilitado y los únicos roles para profesores y alumnos eran los `demo_*` de `pnpm seed:demo`. §23.1 del SRS prevé que la V1 opere con cuentas locales «creadas o administradas por personal autorizado», que el profesor o ayudante registre alumnos con correo y credenciales temporales y que pueda exigirse el cambio de contraseña en el primer acceso. §24 pide que los roles se compongan de permisos sin comprobaciones rígidas de rol, y §§8.1–8.2 describen interfaces distintas para alumno y profesor.

Además, en una instalación nueva el bootstrap fallaba: las migraciones 0005–0012 insertan permisos y el bootstrap exigía que la tabla `permissions` estuviera vacía, así que siempre respondía «instalación ya inicializada».

El responsable también pidió una interfaz más sencilla para el profesor: un menú lateral que permanece oculto hasta abrirlo (al estilo de GitHub), iconografía para entender cada botón y que el flujo natural de profesores y alumnos quede implícito en la interfaz.

## Decisión

**D1 — Catálogo de roles en el esquema.** La migración `0015_identity_roles_members` inserta el catálogo completo de permisos y tres roles: `laboratory_responsible` (todos los permisos), `laboratory_teacher` («Profesor») y `laboratory_student` («Alumno»). Sus permisos viven en `LABORATORY_ROLE_CATALOG` (`access-catalog.ts`); la migración se generó a partir de él. El profesor recibe los permisos del rol demo más `laboratory.membership.manage`, `laboratory.role.assign`, `inventory.loan` e `incident.resolve`, siguiendo §8.2. El alumno conserva los del rol demo. `pnpm seed:demo` usa ahora estos roles.

**D2 — Nadie otorga más autoridad de la que tiene.** Un rol es asignable, y una persona administrable, sólo si cada uno de sus permisos que va más allá de los registros propios también lo tiene quien actúa en ese laboratorio. Los permisos de autoservicio (`SELF_SERVICE_PERMISSIONS`: asistencia, uso, préstamos, incidencias y reservaciones propias, y consulta de prácticas) no cuentan, porque no dan poder sobre otras personas. Así un profesor da de alta a alumnos y a otros profesores, pero no crea ni toma el control de un responsable. Nadie cambia su propio acceso. La regla es una función pura (`withinActorPermissions`) sin nombres de rol.

**D3 — Alta con contraseña temporal.** `MemberAdministration` (identity/application) crea la cuenta local, su credencial y la membresía con su rol en una sola transacción, autorizada con `authorizeLocked`. La contraseña temporal (cuatro grupos de cinco caracteres sin `l`, `o`, `0` ni `1`, generados con `crypto.randomBytes`) se hashea con `hashPassword` de Better Auth, se muestra una sola vez a quien la creó y no se guarda en claro. Si el correo ya tiene cuenta, sólo se añade la membresía y la persona conserva su contraseña.

**D4 — Cambio obligatorio verificable.** `users.temporary_password_issued_at` registra cuándo se emitió la contraseña temporal. El cambio está pendiente mientras la credencial no se haya actualizado después de ese instante (`passwordChangePending`). No hay bandera que limpiar: sólo cambiar la contraseña con Better Auth la satisface. Mientras esté pendiente, `/app` y los laboratorios redirigen a `/app/account/security`, que lo explica y, al terminar, lleva al laboratorio.

**D5 — Administración de personas.** `/app/labs/[slug]/people` («Personas», con `laboratory.membership.manage`) lista a quienes tienen acceso, con su estado (activo, sin acceso o «aún no cambia su contraseña»), y permite crear cuentas, cambiar el rol (con `laboratory.role.assign`, reemplaza los roles de la membresía), quitar o devolver el acceso (desactiva la membresía y conserva el historial) y emitir una nueva contraseña temporal, que además cierra todas las sesiones de esa persona. Como la cuenta es global, la nueva contraseña se rechaza si la persona tiene acceso activo a otro laboratorio.

**D6 — Bootstrap compatible con las migraciones.** El bootstrap considera inicializada una instalación sólo si ya hay usuarios, laboratorios o membresías. Reutiliza los permisos y el rol responsable existentes (`ON CONFLICT DO NOTHING`) y garantiza que el responsable tenga todos los permisos.

**D7 — Navegación al estilo de GitHub, con el flujo implícito.** _(Reemplazada por el [ADR 0023](0023-single-navigation-and-institutional-palette.md): las pestañas y el menú lateral repetían las mismas secciones.)_ Tras revisar la primera versión, el responsable pidió menos texto y una guía natural en vez de fases rotuladas, tomando como referencia los patrones de GitHub. Un shell común (`src/app/_shell`) aplica:

- **Encabezado** gris claro con botón de menú, logo y nombre del laboratorio. A la derecha, un menú «+» con lo que la persona suele empezar (nueva práctica, nueva reservación, reportar una falla, agregar persona, según permisos), la campana de notificaciones y las iniciales.
- **Pestañas con ícono** bajo el encabezado, como las de un repositorio: subrayado guinda en la activa y desplazamiento horizontal en pantallas angostas. Su orden sigue el de una práctica (Prácticas, Reservaciones, Asistencia, Uso de equipo, Préstamos, Incidencias, Mantenimiento, Inventario, Espacios, Reportes, Personas): el orden guía, sin rótulos.
- **Menú lateral** como `<dialog>` modal, oculto hasta abrirlo: ícono y nombre por opción, sin descripciones, separadores entre secciones del laboratorio, cuenta y «Tus laboratorios». Se cierra al navegar, con Esc o tocando fuera.
- **Inicio como tablero.** A la izquierda, el laboratorio, el rol y una sola acción principal (profesor: «Nueva práctica»; alumno: «Reservar equipo»). A la derecha, cajas con encabezado: «Tus próximas sesiones», «Incidencias por atender» o «Tus reportes» y préstamos activos. La guía está en los datos: junto a una sesión en curso aparece «Pasar lista» para el profesor o «Registrar asistencia» para el alumno; si aún no empieza, «Ver sesión» o «Ver instrucciones».
- **Botones** discretos con borde por defecto, y guinda sólo para la acción principal de la página. Cajas con borde fino, radio de 6 px y contadores en píldora. En «Personas», la lista va primero y el formulario aparece al pulsar «Agregar persona».

Las secciones y acciones se deciden con permisos (`labNavigation`, `createActions`), nunca con claves de rol. Las próximas sesiones salen de `AcademicWeb.upcoming`, que reutiliza las consultas autorizadas de prácticas: hasta 20 prácticas publicadas, y para un profesor sólo las sesiones que imparte.

La tipografía es Atkinson Hyperlegible Next, que distingue bien 1/l/I y 0/O en proyector y celular, servida por `next/font`. Los íconos son de `lucide-react`, una dependencia nueva con versión fija. Los colores son tokens de Tailwind en `globals.css`: lienzo blanco, gris claro para encabezados y cajas, guinda IPN como único acento, verde para «activo» y ámbar para «pendiente».

## Alternativas consideradas

- Seguir con los roles `demo_*`: no sirven para cuentas reales y no permiten dar de alta a nadie.
- Asignabilidad por lista fija de roles («el profesor asigna alumno»): reintroduce comprobaciones rígidas de rol que §24 pide evitar.
- Subconjunto estricto de permisos sin autoservicio: el profesor no podría dar de alta alumnos, porque el alumno tiene permisos propios (registrar su asistencia) que el profesor no necesita.
- Usar el plugin `admin` de Better Auth: añade su propio modelo de roles global, paralelo al de laboratorios y permisos.
- Bandera booleana `must_change_password` que se limpia con una acción: cualquiera podría limpiarla sin cambiar la contraseña.
- Menú lateral siempre visible con etiquetas: ocupa espacio en celular y el responsable pidió que permanezca oculto.
- Fases rotuladas («Antes, durante y después de la práctica») con descripciones en cada opción: fue la primera versión y el responsable la consideró texto de más.
- Agrupar por módulo técnico (Spatial, Inventory…): es el orden en que se construyó el sistema, no el orden en que se usa.

## Consecuencias

- Una instalación nueva puede inicializarse con `pnpm bootstrap:development` y el responsable da acceso a profesores y alumnos desde la web, sin scripts.
- La contraseña temporal sólo se ve una vez; si se pierde, se emite otra.
- Sin auditoría persistente todavía (§25): las altas, cambios de rol y restablecimientos no quedan registrados hasta implementar Audit, que los cambios de permisos exigen.
- No hay registro masivo por grupo (§23.1 menciona «grupo»): el alta es individual.
- Las páginas de cada módulo conservan su diseño interior; ahora viven dentro del shell nuevo y se pueden alinear con los tokens poco a poco.
- Las pruebas e2e que entraban a un módulo desde el inicio ahora usan las pestañas («Secciones del laboratorio»).
- La consulta de próximas sesiones hace una lectura por práctica. Si el número de prácticas crece, conviene una consulta dedicada en Academic.

## Referencias SRS

§5 (PD3, PD6), §§8.1–8.2, RF1, RF6, §23.1, §24, §25, §31.

Relacionados: [ADR 0004](0004-identity-permissions.md), [ADR 0006](0006-laboratory-scope.md), [ADR 0008](0008-local-authentication.md).
