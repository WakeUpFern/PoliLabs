# 0024 — Despliegue inicial en Vercel con Postgres administrado y documentos en S3

Estado: **Propuesta** (3 de noviembre de 2026; implementada a petición del responsable para que el profesor encargado empiece pronto, pendiente de aprobación explícita)

## Contexto

Labora sólo corría con `pnpm dev` en una máquina con PostgreSQL local. El profesor encargado quiere usarlo lo antes posible. El destino a largo plazo sigue siendo AWS, para poder usar servicios de IA, pero preparar esa infraestructura toma más tiempo. El responsable propuso arrancar en el plan gratuito de Vercel y migrar después.

Tres partes del sistema suponían un servidor con disco propio:

- Los documentos (ADR 0016) se guardaban con un único adaptador de disco local. En Vercel el sistema de archivos de cada función es efímero, así que se perderían.
- La subida admitía 10 MB, pero Vercel limita el cuerpo de una petición a una función a unos 4.5 MB.
- El pool de PostgreSQL abría hasta 5 conexiones por proceso. En Vercel cada instancia tiene su propio pool, y un Postgres gratuito admite pocas conexiones directas.

## Decisión

**D1 — Vercel (plan Hobby) para la aplicación y Neon para PostgreSQL.** La aplicación se despliega sin cambios de framework. La base vive en un Postgres administrado (Neon, desde el Marketplace de Vercel o directo). La aplicación usa la URL con _pooling_ del proveedor; las migraciones y el bootstrap usan la URL directa y se corren desde la máquina del responsable con los comandos existentes (`pnpm db:migrate`, `pnpm bootstrap:development`).

**D2 — Adaptador S3 para documentos.** `S3ObjectStorage` implementa el puerto `ObjectStorage` con `@aws-sdk/client-s3` (versión fija). Se elige con `DOCUMENT_STORAGE=s3`. El disco local sigue siendo el valor por defecto para desarrollo, y en Vercel (`VERCEL` definido) se rechaza para no perder archivos. Un `PUT` de S3 es atómico, así que no se necesitan claves temporales. El bucket es privado: los documentos sólo se sirven por la ruta autorizada de siempre. Las variables usan el prefijo `DOCUMENT_STORAGE_S3_*` porque Vercel reserva los nombres `AWS_*`. Con `DOCUMENT_STORAGE_S3_ENDPOINT` funciona cualquier servicio compatible con S3, pero se recomienda un bucket de AWS S3 desde ahora, para que la migración no mueva los documentos.

**D3 — Límite de 4 MB por documento.** `MAX_DOCUMENT_BYTES` baja de 10 MB a 4 MB para quedar bajo el límite de Vercel. El CHECK de PostgreSQL sigue permitiendo 10 MB, de modo que en AWS el límite puede volver a subir sin migración.

**D4 — Pool pequeño en serverless.** `DATABASE_POOL_MAX` controla el tamaño del pool. Si no se define, es 1 en Vercel y 5 en los demás entornos. Las conexiones ociosas se cierran a los 10 s.

**D5 — Limpieza diaria por cron de Vercel.** `GET /api/cron/documents-sweep` borra objetos huérfanos con más de 24 h, con la misma lógica que `pnpm documents:sweep --apply` (`sweepOrphanObjects`). Vercel lo llama una vez al día (`vercel.json`; el plan Hobby no permite más) con `Authorization: Bearer $CRON_SECRET`. Sin un `CRON_SECRET` de al menos 32 caracteres la ruta responde 404.

**D6 — Correo apagado al inicio.** Sólo existe el adaptador de archivos `.eml`, que no sirve en Vercel. Se despliega con `EMAIL_TRANSPORT=disabled`: las notificaciones in-app funcionan y los correos quedan pendientes en el outbox para enviarse cuando exista un adaptador real (SES en AWS). Las contraseñas temporales ya se muestran en pantalla a quien da de alta (ADR 0022), así que el arranque no depende del correo.

## Alternativas consideradas

- Ir directo a AWS: es el destino, pero retrasa el arranque del profesor.
- Vercel Blob para documentos: es más fácil de configurar en Vercel, pero obligaría a mover los archivos y escribir otro adaptador al migrar.
- Subida directa del navegador a S3 con URL prefirmada para conservar 10 MB: cambia el flujo de validación del ADR 0016 (firma de bytes y checksum en el servidor). Se puede hacer después si 4 MB no alcanza.
- Supabase en vez de Neon: también funciona; Neon se integra con Vercel y su URL con pooling es directa de configurar.

## Consecuencias

- El profesor puede empezar sin servidor propio y sin costo, dentro de los límites del plan gratuito.
- El plan Hobby de Vercel es para uso no comercial. Un laboratorio escolar encaja, pero conviene revisarlo si el uso crece.
- Los respaldos dependen del proveedor de Postgres, cuyo plan gratuito tiene una ventana de restauración corta. Los respaldos propios siguen pendientes.
- Las vistas previas de Vercel tienen otra URL y no coinciden con `BETTER_AUTH_URL`, así que el inicio de sesión sólo funciona en el dominio de producción.
- Migrar a AWS será: `pg_dump`/`pg_restore` de la base, el mismo bucket S3 (o una copia), y volver a subir el límite de documentos si se quiere.

## Referencias

ADR 0016 (documentos), ADR 0019 (correo por outbox), ADR 0022 (contraseñas temporales). Guía: [despliegue en Vercel](../architecture/deployment-vercel.md).
