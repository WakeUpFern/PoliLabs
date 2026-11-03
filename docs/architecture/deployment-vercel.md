# Despliegue en Vercel

Guía para publicar Labora en el plan gratuito de Vercel con PostgreSQL en Neon y documentos en AWS S3. La decisión está en el [ADR 0024](../decisions/0024-vercel-deployment.md).

Necesitas cuentas en [Vercel](https://vercel.com) (con el GitHub del repositorio), [Neon](https://neon.tech) y [AWS](https://aws.amazon.com), además de tu copia local del repositorio con `pnpm install` hecho.

## 1. Bucket de documentos en S3

1. En la consola de AWS abre **S3 → Create bucket**. Usa la región `us-east-1`, que es la misma de Vercel y Neon, y un nombre como `labora-documentos`. Deja activado **Block all public access**.
2. En **IAM → Users → Create user** crea un usuario `labora-vercel` sin acceso a la consola.
3. En ese usuario, **Add permissions → Create inline policy → JSON**, pega esto (cambia el nombre del bucket) y guárdalo:

   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
         "Resource": "arn:aws:s3:::labora-documentos/*"
       },
       {
         "Effect": "Allow",
         "Action": "s3:ListBucket",
         "Resource": "arn:aws:s3:::labora-documentos"
       }
     ]
   }
   ```

4. En **Security credentials → Create access key** elige «Application running outside AWS». Guarda el _Access key ID_ y el _Secret access key_; el secreto sólo se muestra una vez.

## 2. Base de datos en Neon

1. Crea un proyecto en Neon con PostgreSQL 16 y región **AWS US East 1 (N. Virginia)**.
2. En **Connect** copia dos cadenas de conexión de la base `neondb`:
   - **Con pooling** (el host contiene `-pooler`): la usará Vercel.
   - **Directa** (sin `-pooler`): la usarás tú para migrar.

   Ambas terminan en `?sslmode=require`.

## 3. Preparar la base desde tu máquina

Genera el secreto de autenticación y guárdalo en tu gestor de contraseñas; Vercel usará el mismo:

```sh
openssl rand -base64 48
```

Corre las migraciones y crea la cuenta del responsable y el laboratorio. Usa la URL **directa**. `BETTER_AUTH_URL` debe ser la dirección final del sitio; si aún no la conoces, usa `https://<nombre-del-proyecto>.vercel.app`, que es la que Vercel asigna.

```sh
export DATABASE_URL='postgresql://…@ep-xxxx.us-east-1.aws.neon.tech/neondb?sslmode=require'
export BETTER_AUTH_SECRET='<el secreto generado>'
export BETTER_AUTH_URL='https://<nombre-del-proyecto>.vercel.app'
pnpm db:migrate
pnpm bootstrap:development
unset DATABASE_URL BETTER_AUTH_SECRET BETTER_AUTH_URL
```

El bootstrap pide el nombre, el correo y la contraseña del responsable y el nombre del laboratorio. No corras `pnpm seed:demo` en producción.

## 4. Proyecto en Vercel

1. En Vercel, **Add New → Project** e importa el repositorio de GitHub. Vercel detecta Next.js; no cambies los comandos de build.
2. En **Environment Variables** agrega estas variables para _Production_ antes del primer despliegue:

   | Variable                                | Valor                                      |
   | --------------------------------------- | ------------------------------------------ |
   | `ENABLE_EXPERIMENTAL_COREPACK`          | `1` (usa el pnpm 11 de `package.json`)     |
   | `DATABASE_URL`                          | la URL **con pooling** de Neon             |
   | `BETTER_AUTH_SECRET`                    | el mismo secreto del paso 3                |
   | `BETTER_AUTH_URL`                       | `https://<nombre-del-proyecto>.vercel.app` |
   | `DOCUMENT_STORAGE`                      | `s3`                                       |
   | `DOCUMENT_STORAGE_S3_BUCKET`            | `labora-documentos`                        |
   | `DOCUMENT_STORAGE_S3_REGION`            | `us-east-1`                                |
   | `DOCUMENT_STORAGE_S3_ACCESS_KEY_ID`     | el _Access key ID_ del paso 1              |
   | `DOCUMENT_STORAGE_S3_SECRET_ACCESS_KEY` | el _Secret access key_ del paso 1          |
   | `EMAIL_TRANSPORT`                       | `disabled`                                 |
   | `CRON_SECRET`                           | el resultado de `openssl rand -hex 32`     |

   Marca los secretos como _Sensitive_. La versión de Node (24) sale de `engines` en `package.json`.

3. Pulsa **Deploy**. Si Vercel asignó otra dirección distinta a la que usaste, corrige `BETTER_AUTH_URL` en **Settings → Environment Variables** y vuelve a desplegar desde **Deployments → Redeploy**.

## 5. Comprobar

1. Entra a la dirección de producción e inicia sesión con la cuenta del responsable.
2. En **Personas** da de alta al profesor. Copia la contraseña temporal que aparece y entrégasela; al entrar la tendrá que cambiar.
3. Sube un manual en un equipo (PDF de menos de 4 MB) y ábrelo. Debe aparecer en el bucket bajo `documents/`.
4. En **Settings → Cron Jobs** de Vercel debe aparecer `/api/cron/documents-sweep` una vez al día.

## Lo que queda fuera por ahora

- **Correo:** las notificaciones in-app funcionan; los correos se acumulan pendientes hasta que exista un adaptador real.
- **Vistas previas:** las ramas y PRs generan despliegues con otra URL donde el inicio de sesión no funciona. Es esperado.
- **Respaldos:** dependen de la ventana de restauración de Neon. Para un respaldo propio, `pg_dump` con la URL directa y una copia del bucket.

## Migrar a AWS después

1. `pg_dump` de Neon y `pg_restore` en RDS (o el Postgres que se elija).
2. Mantener el mismo bucket S3; en AWS basta un rol de IAM y se pueden omitir las llaves `DOCUMENT_STORAGE_S3_ACCESS_KEY_ID`/`SECRET`.
3. Si se quiere, volver a subir `MAX_DOCUMENT_BYTES` a 10 MB; la base ya lo permite.
