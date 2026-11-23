# 0026 — Fotos y notas de artículos de inventario, y cámara del celular

Estado: **Propuesta**. La función la pidió el responsable el 23 de noviembre de 2026 a petición del profesor del laboratorio; los detalles (permisos, límites, compresión) quedan pendientes de su aprobación. Amplía el [ADR 0016](0016-documents-object-storage.md) sin reemplazarlo.

## Contexto

El profesor pidió que al registrar inventario se pueda subir una foto con una descripción, por ejemplo «a esta caja de llaves le falta una llave», como evidencia. Las fotos sirven sobre todo para inventario y mantenimiento. En computadora basta con elegir un archivo; en el celular se debe poder elegir uno o tomar la foto con la cámara.

El ADR 0016 ya guarda manuales de recursos y evidencia de mantenimiento en almacenamiento de objetos (disco local o S3, [ADR 0024](0024-vercel-deployment.md)), con metadatos en `documents`, descarga autorizada y archivado lógico. No admitía artículos de inventario ni texto libre por archivo. Las fotos de celular suelen pesar de 3 a 8 MB, por encima del límite de 4 MB de Vercel, y conservan EXIF con la ubicación GPS. SRS RF15–RF22, RF24, RNF7, RNF10, §§11, 18, 22.1, 30.

## Decisión

**D1 — Un destino más en `documents`.** Columna `inventory_item_id` con FK compuesta `(inventory_item_id, laboratory_id) → inventory_items`, incluida en la asociación exclusiva (`num_nonnulls(resource_id, maintenance_log_id, inventory_item_id) = 1`). Se reutilizan el puerto `ObjectStorage`, la ruta de subida, la descarga autorizada, el archivado con motivo y el barrido de huérfanos. No se crea tabla ni bucket.

**D2 — Nota por archivo.** Columna `note` opcional (1–1000 caracteres, recortada) para fotos de inventario y evidencia de mantenimiento; es inmutable como el resto de los metadatos (el trigger existente sólo permite archivar). Los manuales siguen usando `title`.

**D3 — Sólo fotos en inventario.** PNG, JPEG o WebP verificados por firma; un PDF se rechaza en el servicio (`image-only`) y en la base (CHECK `documents_inventory_item_image_check`). Máximo 10 fotos activas por artículo, comprobado en el servicio con el artículo bloqueado `FOR UPDATE` y en el trigger `documents_limit_evidence`, ampliado para artículos. Sólo los artículos activos aceptan fotos; las existentes siguen visibles tras desactivarlo.

**D4 — Permisos existentes, sin permisos nuevos.**

| Operación                | Permisos                               |
| ------------------------ | -------------------------------------- |
| Ver y descargar fotos    | `inventory.read`                       |
| Subir foto a un artículo | `inventory.manage` + `document.upload` |
| Archivar foto            | `document.archive` + `inventory.read`  |

Con los roles actuales, responsable y profesor ven las fotos; sólo el responsable sube y archiva. Dar al profesor la subida sería un cambio de roles aparte.

**D5 — Compresión en el navegador.** Antes de enviar, el cliente decodifica la imagen respetando su orientación, la reduce a 1600 px en el lado mayor y la vuelve a codificar como JPEG (calidad 0.82). El resultado ronda 300–600 KB y no lleva EXIF (GPS, dispositivo, fecha), lo que resuelve para las fotos el pendiente de privacidad del ADR 0016. Si el navegador no puede decodificarla (p. ej. HEIC en Chrome) se envía tal cual y el servidor responde con los formatos aceptados. Los PDF no se tocan. El servidor repite todas las validaciones; el límite sigue en 4 MB.

**D6 — Cámara en el celular.** El selector muestra en pantallas táctiles (`pointer: coarse`) dos botones: «Tomar foto» (`accept="image/*"`, `capture="environment"`, cámara trasera) y «Elegir de la galería». En computadora sólo aparece «Elegir archivo». Se usa en fotos de inventario, evidencia de mantenimiento y manuales.

**D7 — Foto al registrar.** El alta de artículo admite una foto y su nota opcionales. La Server Action crea el artículo y devuelve su id; el formulario sube la foto por la ruta dedicada y navega al detalle. Si la foto falla, el artículo queda registrado y el detalle lo avisa. El detalle tiene la sección «Fotos y notas» con miniaturas, nota, autor y fecha.

## Alternativas

- Tabla `inventory_photos` aparte: duplicaría almacenamiento, descarga, archivado y barrido ya probados.
- Subir la foto dentro de la Server Action del alta: exigiría ampliar `bodySizeLimit` de todas las acciones, rechazado en el ADR 0016.
- Comprimir en el servidor (p. ej. `sharp`): el archivo original ya habría superado el límite de Vercel antes de llegar.
- Permiso nuevo `inventory.photo`: no hay hoy un rol que lo necesite separado de administrar artículos.
- Incluir incidencias: el ADR 0016 dejó abierto quién ve fotos de terceros cuando `incident.read` es sólo propio; sigue pendiente.

## Consecuencias

Migración `0016_inventory_photos.sql`: dos columnas, una FK, un índice, dos CHECK nuevos, la asociación exclusiva recreada y la función del límite reemplazada. Sin DROP de datos ni cambios en tablas de inventario. Las fotos de inventario ocupan el mismo bucket; con 10 fotos de ~500 KB por artículo, 200 artículos son ~1 GB en el peor caso.

Pendientes: fotos en incidencias, subida por el profesor (roles), varias fotos por envío, recorte o anotación de la imagen, y miniaturas generadas en el servidor (hoy la miniatura es la misma imagen reducida a 1600 px).

## Referencias SRS

RF15–RF22, RF24; RNF4–7, RNF9–10; §§11, 18, 22.1, 30. ADR 0003, 0004, 0010, 0015, 0016, 0024. Ver [Documents I](../architecture/documents.md) e [Inventory I](../architecture/inventory.md).
