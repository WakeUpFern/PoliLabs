# Validación de la inicialización

Fecha: 24 de septiembre de 2026. Alcance: fundamentos de Labora, sin módulos funcionales.

## Resultados

- Configuración PostgreSQL concluida (24 de septiembre de 2026): `docker compose config --quiet` aprobó para `postgres:17-alpine`, `127.0.0.1:5433`, usuario `labora`, base `labora_dev`, volumen persistente y healthcheck. En Debian, `sudo docker compose up -d --wait` descargó la imagen oficial, creó la red y el volumen `polilabs_postgres_data`, e informó el contenedor `polilabs-postgres-1` como saludable.
- Node.js v24.21.0 y pnpm v11.19.0 se instalaron localmente mediante nvm y Corepack, respetando `.nvmrc` y `packageManager`. `pnpm install --frozen-lockfile` concluyó sin cambios.
- `pnpm db:check` aprobó desde Debian e informó `PostgreSQL connection OK`. El script usa Drizzle y solo ejecuta `select 1`, por lo que confirma la conectividad sin escribir tablas o datos de negocio.
- `pnpm check` aprobó de nuevo: ESLint, TypeScript, 2 pruebas y formato. `pnpm build` aprobó con Next.js 16.3.6 y generó estáticamente `/` y `/_not-found`.
- SRS completo leído en `docs/srs/PoliLabs-SRS.tex`. No se editó su contenido ni el PDF original. La ruta se registró como decisión explícita en ADR 0007.
- Node.js 24.19.0 y pnpm 11.19.0 del runtime de Codex se utilizaron para las comprobaciones iniciales; posteriormente se verificó la misma rama de Node en Debian mediante la instalación local indicada arriba. El proyecto no depende de rutas internas de Codex.
- Compilación de producción de Next.js 16.3.6 completada; `/` y la página de no encontrado se generan estáticamente, sin conexión a PostgreSQL ni variables secretas.
- TypeScript estricto: sin errores.
- Pruebas automatizadas: 2 aprobadas. Cubren URLs PostgreSQL válidas y rechazo de configuración ausente, malformada, de otro protocolo o sin base; el mensaje de error no revela credenciales.
- `pnpm check`: aprobado en la revisión final; ESLint sin errores ni advertencias y Prettier sin diferencias. Se corrigió la exportación anónima de PostCSS.
- `pnpm peers check`: sin incompatibilidades con las versiones finales.
- Servidor de producción iniciado en `127.0.0.1:3000` y página inspeccionada visualmente en el navegador integrado. Título Labora, encabezados y texto visibles; consola consultada sin errores ni advertencias. No hay formularios ni flujo API/datos que verificar todavía.

## Limitaciones y decisiones de herramientas

- Docker Compose v5.5.1 está instalado y `docker compose config` validó la configuración resuelta para `postgres:17-alpine`, `127.0.0.1:5433`, `labora_dev`, el volumen `postgres_data` y su healthcheck. La sesión de Codex no tiene acceso efectivo al daemon: `/var/run/docker.sock` devolvió `permission denied` y aparece con grupo `nogroup`. Esto no afectó la validación realizada desde la terminal de Debian del usuario mediante `sudo`; no se eliminaron contenedores, volúmenes ni datos existentes.
- `agent-browser` no estaba instalado; se utilizó el navegador integrado como alternativa para inspección visual y consola. No se realizó una matriz de dispositivos ni pruebas de accesibilidad automatizadas.
- El sandbox bloqueó sockets del servidor, de tsx y del procesamiento CSS de Turbopack (`EPERM`). Las ejecuciones autorizadas fuera del sandbox permitieron validar las herramientas. Turbopack conservó el fallo de la ejecución restringida en su caché: se apartó `.next` en `/tmp/labora-next-sandbox-cache-20260924` y la compilación limpia final pasó. No se alteró la configuración de herramientas para esquivar restricciones.
- ESLint 10.11.0 se evaluó y falló en `react/display-name`: los plugins React, import y jsx-a11y de la configuración Next.js declaran compatibilidad hasta ESLint 9. Se fija 9.39.5 para mantener compatibilidad; está fuera de soporte y debe revisarse al actualizar el conjunto. No se desactivaron reglas para encubrir el fallo.
- TypeScript 5.9.3 respeta el rango del parser TypeScript de lint (`>=4.8.4 <6.1.0`); no se adoptó TypeScript 7 sin soporte declarado.
- Drizzle ORM 0.45.3 y Kit 0.31.11 son versiones estables. Kit incluye `@esbuild-kit/core-utils` y `@esbuild-kit/esm-loader` deprecados; se registra la advertencia sin forzar dependencias transitivas ni adoptar releases preliminares.

## Referencias de compatibilidad consultadas

- [Next.js: instalación y requisitos](https://nextjs.org/docs/app/getting-started/installation).
- [Tailwind con Next.js](https://tailwindcss.com/docs/installation/framework-guides/nextjs).
- [Drizzle con PostgreSQL](https://orm.drizzle.team/docs/get-started-postgresql): se mantiene la rama estable aunque la documentación muestre ejemplos con RC.
- Metadatos del registro mediante `pnpm view`: versiones, engines y peer dependencies; lockfile conserva la resolución final.

## Repetición local

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm build
```

Después de configurar `.env` y disponer de Docker/Compose:

```bash
docker compose up -d --wait
pnpm db:check
```

Una conexión exitosa no equivale a probar reglas de negocio. Esas pruebas deberán acompañar cada módulo implementado.
