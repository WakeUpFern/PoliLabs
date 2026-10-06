# Labora · PoliLabs

Base de una plataforma de gestión académica y operativa para laboratorios. Primera implementación prevista: Laboratorio de Pesados, UPIITA-IPN. Proyecto de servicio social universitario.

Esta entrega contiene los fundamentos técnicos, autenticación local con Better Auth, autorización por laboratorio y el catálogo espacial básico. Incluye login, logout, cambio de contraseña, selección de laboratorios, espacios, ubicaciones jerárquicas y recursos físicos individuales. Reservations I añade servicios backend de disponibilidad, creación individual, consulta propia y cancelación con protección concurrente. Reservations II expone esas capacidades en el flujo web individual: formulario de Space/Resources, disponibilidad, creación, listado propio, detalle y cancelación. Inventory I incorpora catálogo por cantidad, búsqueda, existencias con ubicación opcional, movimientos, edición, desactivación e historial. Préstamos, activos individualizados, planos, mantenimiento, gestión académica y Giussepe siguen pendientes.

## Requisitos

- Node.js 24 LTS y pnpm 11.19.0 (`packageManager` fija la versión).
- Docker Engine con Compose v2 para PostgreSQL 17 Alpine local, o una instalación propia de PostgreSQL 17.
- No se necesitan cuenta AWS, credenciales institucionales ni servicios de pago.

`.nvmrc` selecciona la rama 24 para quienes usan nvm. Tras instalar Node, habilita el gestor fijado por el proyecto con `corepack enable`; los comandos `pnpm` usarán la versión 11.19.0 declarada en `packageManager`. No es necesario instalar pnpm globalmente.

## Ejecutar la web

```bash
pnpm install --frozen-lockfile
pnpm dev
```

Abre [localhost:3000/login](http://localhost:3000/login). El login y `/app` requieren `.env`, PostgreSQL, migraciones aplicadas y una cuenta local. La página informativa `/` no consulta la base de datos.

## PostgreSQL local

```bash
cp .env.example .env
```

Edita `.env`: sustituye `CHANGE_ME` por una contraseña exclusivamente local en `POSTGRES_PASSWORD` y en `DATABASE_URL`. Si contiene caracteres especiales, codifícalos como URL en `DATABASE_URL`. La configuración por defecto crea el usuario `labora` y la base `labora_dev`, y publica PostgreSQL en `127.0.0.1:5433`; `DATABASE_URL` debe usar esos mismos valores. No compartas ni versionees `.env`.

```bash
docker compose up -d --wait
pnpm db:check
```

Compose usa la imagen oficial `postgres:17-alpine`, expone el puerto solo en `127.0.0.1` y conserva datos en el volumen `postgres_data`. `docker compose stop` detiene PostgreSQL conservando datos; para retomarlo, ejecuta otra vez `docker compose up -d --wait`. Para reiniciar el entorno de desarrollo sin borrar la base, usa `docker compose stop` y después `docker compose up -d --wait`. Las variables de inicialización del contenedor solo se aplican a un volumen nuevo; editar la contraseña en `.env` no cambia una base existente.

Si usas PostgreSQL instalado directamente, crea una base y usuario locales y configura `DATABASE_URL`; no necesitas Compose. `db:check` ejecuta `select 1` mediante Drizzle, sin escribir datos.

Next.js, Drizzle y el script de conexión cargan configuración mediante `@next/env`. `.env.local` puede sobrescribir `.env` para la aplicación, pero Compose lee `.env`; evita valores contradictorios. Ninguna variable de base de datos debe usar el prefijo `NEXT_PUBLIC_`.

## Esquema y migraciones

El esquema contiene las tablas de autenticación y el primer modelo aprobado de laboratorios, membresías, roles y permisos. Las migraciones versionadas son:

- `0000_late_devos.sql`: Better Auth con UUID nativo.
- `0001_reflective_shriek.sql`: laboratorio, membresías y autorización de aplicación.
- `0002_ancient_blue_marvel.sql`: catálogo de espacios y permisos de Spatial I.
- `0003_strange_red_hulk.sql`: ubicaciones, recursos y permisos de Spatial II.
- `0004_skinny_morg.sql`: reservaciones individuales, asociaciones del mismo Space, permisos y triggers de concurrencia.
- `0005_foamy_the_anarchist.sql`: Inventory I, saldos/movimientos/eventos, permisos y protección transaccional e integración con desactivación espacial.
- `0006_academic_i.sql`: prácticas, sesiones, participantes y eventos académicos.
- `0007_attendance_i.sql`: asistencia única, contexto de ubicación, eventos y permisos.
- `0008_usage_i.sql`: uso efectivo por recurso/contexto, eventos y permisos.

Para cambios posteriores:

1. Definir sus tablas y exportarlas desde `src/infrastructure/database/schema.ts`.
2. Ejecutar `pnpm db:generate` y revisar el SQL generado en `drizzle/`.
3. Versionar la migración y ejecutar `pnpm db:migrate` sobre la base local configurada sólo después de revisarla.
4. Probar restricciones, transacciones y concurrencia cuando corresponda.

No ejecutar cambios destructivos sin aprobación explícita ni reemplazar migraciones revisadas por `drizzle-kit push`.

## Bootstrap inicial

En una instalación vacía, después de aplicar las migraciones:

```bash
pnpm bootstrap:development
```

El comando crea interactivamente la primera identidad local, el Laboratorio de Pesados, su membresía y el rol responsable mínimo. La contraseña no se recibe como argumento y no se muestra. El registro público continúa deshabilitado y el bootstrap se detiene si detecta una instalación ya inicializada.

Después del bootstrap, inicia `pnpm dev`, abre `/login` y usa el correo y la contraseña capturados. No hay registro público ni recuperación de contraseña en esta etapa.

## Flujo de autenticación disponible

- `/login` autentica por correo y contraseña mediante Better Auth y muestra un error uniforme para credenciales inválidas o cuentas inactivas.
- `/app` valida la sesión en el servidor, resuelve únicamente `actorUserId` y vuelve a comprobar que `users.is_active` sea verdadero.
- El selector muestra laboratorios activos asociados a membresías activas del usuario, junto con sus roles locales.
- `/app/labs/[slug]` trata el slug como intención de navegación y usa `AuthorizationService` antes de mostrar datos; un laboratorio inexistente o no autorizado produce la misma respuesta de no encontrado.
- `/app/account/security` cambia la contraseña local. La sesión del navegador se rota y permanece autenticada; las demás sesiones se revocan.
- Cerrar sesión revoca la sesión actual y regresa a `/login`.

Consulta [shell autenticado](docs/architecture/authenticated-shell.md) para los límites de seguridad y decisiones de implementación.

## Reservaciones individuales en la web

Después de iniciar sesión, entra a un laboratorio y abre **Reservaciones**:

- `/app/labs/[slug]/reservations`: reservaciones propias, próximas/en curso e historial.
- `/app/labs/[slug]/reservations/new`: Space completo o uno/varios Resources activos del mismo Space, fecha/hora, disponibilidad y confirmación.
- `/app/labs/[slug]/reservations/[reservationId]`: detalle propio y cancelación antes del inicio, según los permisos existentes.

La interfaz interpreta y muestra horarios en `America/Mexico_City`, independientemente de la zona del navegador/Node. Las acciones envían instantes UTC con `Z` a los servicios de Reservations I. Consultar disponibilidad no garantiza la confirmación: un conflicto posterior muestra feedback para seleccionar otro intervalo. El backend revalida permiso, target, tiempo y concurrencia.

El formulario consulta Spatial mediante servicios autorizados (`space.read`, `resource.read` y `location.read` para el contexto opcional). El listado/detalle conservan historial cuando el catálogo cambia; entidades desactivadas o fuera del catálogo visible aparecen con una etiqueta explícita y su identificador propio. No hay paginación ni calendario avanzado. Reservations II no añade permisos, dependencias ni migraciones.

## Inventario en la web

Entra a un laboratorio y abre **Inventario**. Busca artículos por nombre, filtra consumibles/herramientas y registra entradas o salidas desde su detalle. El alta permite saldo cero o existencia inicial trazable, con ubicación opcional. Tipo y unidad quedan fijos tras el primer movimiento; desactivar requiere saldo cero y conserva el historial. Herramientas no admiten consumo ni préstamos todavía.

Rutas: `/app/labs/[slug]/inventory`, `/inventory/new` y `/inventory/[itemId]` dentro del mismo laboratorio. Permisos locales: `inventory.read`, `inventory.manage`, `inventory.adjust`; la migración los asigna al responsable inicial. Consulta [Inventory I](docs/architecture/inventory.md) y sus [resultados de validación](docs/architecture/inventory-validation.md).

## Validación

```bash
pnpm check
pnpm test:integration
pnpm build
pnpm start
```

`check` agrupa ESLint, TypeScript, pruebas unitarias con `node:test`/`tsx` y revisión de formato. `pnpm test:integration` crea o reutiliza una base PostgreSQL local separada, aplica las migraciones y verifica autenticación, bootstrap, restricciones y aislamiento entre laboratorios. `pnpm format` aplica Prettier, excluyendo el SRS original. `pnpm build` genera la aplicación de producción; `pnpm start` la sirve después de compilar.

Las dependencias se declaran en `package.json`; `pnpm-lock.yaml` fija las versiones exactas resueltas. `pnpm-workspace.yaml` permite los scripts de instalación de esbuild y unrs-resolver, usados por las herramientas. TypeScript 5.9 se mantiene dentro de la rama compatible de las herramientas de lint elegidas; actualizarlo requiere verificar sus peer dependencies.

ESLint 9.39.5 está fijado porque los plugins React/import/accesibilidad incluidos por Next.js todavía no admiten ESLint 10. La rama 9 está fuera de soporte: revisar este pin al actualizar los plugins. Drizzle Kit estable también incorpora dos dependencias transitivas de esbuild-kit deprecadas; no se sustituyen por versiones preliminares ni overrides sin validar.

Consulta [validación de la inicialización](docs/architecture/validation.md) para resultados y limitaciones de esta sesión.

## Documentación

- [SRS original](docs/srs/PoliLabs-SRS.tex): fuente de requisitos, sin modificaciones. La ruta real usa `docs` y el nombre `PoliLabs-SRS.tex`.
- [Arquitectura](docs/architecture/README.md): módulos, relaciones, estado implementado y decisiones pendientes.
- [Identity y Authorization](docs/architecture/identity-authorization.md): esquema, permisos, bootstrap y validación del primer flujo.
- [Shell autenticado](docs/architecture/authenticated-shell.md): login, sesión, selección de laboratorio, cambio de contraseña y protección de rutas.
- [Reservations I y II](docs/architecture/reservations.md): backend, integración web individual, tiempo, propiedad, conflictos y validación.
- [Inventory I](docs/architecture/inventory.md): alcance, cantidades, movimientos, permisos y políticas.
- [ADR](docs/decisions/README.md): decisiones aceptadas y propuestas.
- [Instrucciones permanentes](AGENTS.md): continuidad del desarrollo.

Inventory I fue seleccionado explícitamente. Las siguientes ampliaciones deben seleccionarse por separado; esta entrega no autoriza préstamos, activos, planos ni otros módulos operativos.

## Academic I — prácticas y sesiones

Se seleccionó e implementó el siguiente incremento de la propuesta compartida: crear, editar, publicar y cerrar prácticas; programar, consultar, abrir, cerrar y cancelar sesiones; registrar participantes previstos del mismo laboratorio. Acceso desde **Prácticas** en la ficha del laboratorio. Se reutilizan Identity y Space, con servicios autorizados y eventos transaccionales.

Una sesión no reserva automáticamente un espacio; inscripción no significa asistencia ni uso de maquinaria. Usage I aporta el puente entre contexto académico, reservaciones y posteriores incidencias; ver su alcance incremental más abajo. Grupos, periodos, asistencia, préstamos, Incidents, Maintenance y Knowledge quedan fuera de este corte. Ver [Academic I](docs/architecture/academic.md) y [ADR 0011 — Propuesta](docs/decisions/0011-academic-sessions.md): las reglas específicas de permisos, estados y participación quedan documentadas para revisión, sin atribuirles aceptación institucional.

La migración versionada `0006_academic_i.sql` añade las tablas y permisos de este flujo. Las instalaciones existentes reciben los permisos académicos en `laboratory_responsible` al ejecutar `pnpm db:migrate`. No es necesario repetir bootstrap. Las demás membresías requieren permisos asignados explícitamente; no hay altas públicas ni asignación automática de roles por inscripción.

## Attendance I y Usage I

Asistencia: `/app/labs/[slug]/attendance` y entrada estable `/check-in/[slug]/[locationId]`. Autocaptura en sesión abierta, preselección contextual, unicidad y padrón/corrección con historial. La vista espacial ofrece el deep-link; generación visual de QR pendiente.

Uso de maquinaria: `/app/labs/[slug]/usage`. Inicio y fin explícitos por recurso, bajo sesión abierta propia o reservación propia vigente; historial propio y trazabilidad autorizada por recurso. Asistencia y reservación no acreditan uso efectivo ni atribuyen responsabilidad.

Ver [Attendance I](docs/architecture/attendance.md), [Usage I](docs/architecture/usage.md), [validación](docs/architecture/attendance-usage-validation.md) y ADR 0012/0013 (Propuesta). Aplicar migraciones versionadas con `pnpm db:migrate`; no usar schema push. Alumnos necesitan permisos mínimos asignados por la administración autorizada existente; no se crean roles institucionales ni se conceden permisos por inscripción.
