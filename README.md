# Labora · PoliLabs

Base de una plataforma de gestión académica y operativa para laboratorios. Primera implementación prevista: Laboratorio de Pesados, UPIITA-IPN. Proyecto de servicio social universitario.

Esta entrega contiene los fundamentos técnicos y una página informativa. No implementa autenticación, inventario, reservaciones, mantenimiento, gestión académica ni Giussepe.

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

Abre [localhost:3000](http://localhost:3000). La página inicial no consulta la base de datos; puede compilarse y ejecutarse sin `.env` ni PostgreSQL.

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

El esquema está vacío deliberadamente. No hay tablas del SRS ni migraciones ficticias. Al implementar el primer módulo aprobado:

1. Definir sus tablas y exportarlas desde `src/infrastructure/database/schema.ts`.
2. Ejecutar `pnpm db:generate` y revisar el SQL generado en `drizzle/`.
3. Versionar la migración y ejecutar `pnpm db:migrate` sobre la base local configurada.
4. Probar restricciones, transacciones y concurrencia cuando corresponda.

No ejecutar cambios destructivos sin aprobación explícita ni reemplazar migraciones revisadas por `drizzle-kit push`.

## Validación

```bash
pnpm check
pnpm build
pnpm start
```

`check` agrupa ESLint, TypeScript, pruebas con `node:test`/`tsx` y revisión de formato. `pnpm format` aplica Prettier, excluyendo el SRS original. `pnpm test` ejecuta pruebas de validación de configuración; todavía no hay pruebas de funcionalidades de negocio. `pnpm build` genera la aplicación de producción; `pnpm start` la sirve después de compilar.

Las dependencias se declaran en `package.json`; `pnpm-lock.yaml` fija las versiones exactas resueltas. `pnpm-workspace.yaml` permite los scripts de instalación de esbuild y unrs-resolver, usados por las herramientas. TypeScript 5.9 se mantiene dentro de la rama compatible de las herramientas de lint elegidas; actualizarlo requiere verificar sus peer dependencies.

ESLint 9.39.5 está fijado porque los plugins React/import/accesibilidad incluidos por Next.js todavía no admiten ESLint 10. La rama 9 está fuera de soporte: revisar este pin al actualizar los plugins. Drizzle Kit estable también incorpora dos dependencias transitivas de esbuild-kit deprecadas; no se sustituyen por versiones preliminares ni overrides sin validar.

Consulta [validación de la inicialización](docs/architecture/validation.md) para resultados y limitaciones de esta sesión.

## Documentación

- [SRS original](docs/srs/PoliLabs-SRS.tex): fuente de requisitos, sin modificaciones. La ruta real usa `docs` y el nombre `PoliLabs-SRS.tex`.
- [Arquitectura](docs/architecture/README.md): módulos, relaciones, estado implementado y decisiones pendientes.
- [ADR](docs/decisions/README.md): decisiones aceptadas y propuestas.
- [Instrucciones permanentes](AGENTS.md): continuidad del desarrollo.

Próximo paso recomendado: acordar alcance de laboratorio y membresías, decidir cuentas locales y comenzar un corte pequeño de identidad/permisos antes del catálogo de espacios. Ningún módulo siguiente se considera aprobado por esta recomendación.
