# Reports I — Reportes exportables

Fecha: 7 de octubre de 2026. Estado: implementado; políticas en el [ADR 0018](../decisions/0018-exportable-reports.md) (**Aceptada**, aprobada el 7 de octubre de 2026) y resultados en [validación](reports-validation.md). SRS RF de reportes y exportación, §32 y §33.15.

## Alcance

Seis reportes operativos de §32, exportables en CSV y PDF:

| Reporte                                               | Permiso            | Periodo | Columnas principales                                                                                   |
| ----------------------------------------------------- | ------------------ | ------- | ------------------------------------------------------------------------------------------------------ |
| Stock actual de inventario                            | `inventory.read`   | No      | Artículo, tipo, unidad, ubicación, existencia, prestado, disponible                                    |
| Movimientos de inventario                             | `inventory.read`   | Sí      | Fecha, artículo, movimiento, cantidad, antes/después, registró, origen, notas                          |
| Préstamos y devoluciones                              | `inventory.loan`   | Sí      | Prestado el, herramienta, prestatario, cantidad, pendiente, estado, compromiso, devuelto por condición |
| Mantenimiento por recurso                             | `maintenance.read` | Sí      | Espacio, recurso, fecha, tipo, estados, realizó, próximo, incidencia vinculada, materiales             |
| Incidencias y seguimiento                             | `incident.review`  | Sí      | Fecha, objetivo, nombre y espacio conservados, severidad, estado, reportó, resolución                  |
| Recursos fuera de servicio o próximos a mantenimiento | `maintenance.read` | No      | Espacio, recurso, estado operativo, último mantenimiento, próximo, motivo                              |

Fuera de alcance: reportes de prácticas/sesiones, asistencia, reservaciones y uso de maquinaria; filtros adicionales; envío programado; Excel; auditoría de exportaciones.

## Capas

```text
src/modules/reports/
  domain/reports.ts          catálogo, permisos, periodo, límites, formato de fecha
  domain/report-tables.ts    filas tipadas por reporte → columnas y etiquetas en español
  domain/csv.ts              serialización RFC 4180 (pura)
  application/report-store.ts  puerto de lectura por reporte
  application/reports.ts     ReportService: catalog() y generate()
  infrastructure/report-store.ts  consultas Drizzle acotadas al laboratorio
  infrastructure/pdf-renderer.ts  ReportTable → PDF con pdf-lib
  web/reports-web.ts         sesión, fechas locales → instantes, respuesta de descarga
```

`ReportService.generate` valida clave y periodo antes de abrir la transacción, autoriza el permiso del reporte, lee como máximo 5001 filas (una más que el límite para detectar exceso) y proyecta un `ReportTable` independiente del formato: título, laboratorio, periodo, generado por/cuándo, notas, columnas tipadas (`text`, `number`, `time`, `date`) y celdas ya formateadas. CSV y PDF son dos representaciones de esa misma tabla.

El adaptador abre una transacción REPEATABLE READ, ejecuta `authorizeLocked` y entrega una transacción con un método por reporte. Todas las consultas filtran por `laboratory_id` (o por el laboratorio del espacio, para recursos) y ordenan de forma determinista. Sólo leen; no hay escrituras ni migraciones.

## Interfaz

- **`/app/labs/[slug]/reports`**: una tarjeta por reporte permitido, con fechas Desde/Hasta (por defecto los últimos 30 días locales) cuando aplica y botones «Descargar CSV» y «Descargar PDF». Formulario GET nativo, sin JavaScript de cliente. Muestra el motivo si una descarga anterior se rechazó.
- **`/app/labs/[slug]/reports/[report]`**: route handler de descarga (`attachment; filename="<reporte>-<fecha>.<csv|pdf>"`, `no-store`, `nosniff`, `same-origin`). Periodo inválido o reporte demasiado grande → 303 al formulario con `error`; sin permiso, laboratorio ajeno o reporte desconocido → 404.
- **Ficha del laboratorio**: enlace «Reportes» si el catálogo no está vacío.
- **Secciones**: Inventario (stock y movimientos), Préstamos (en «Préstamos del laboratorio»), Mantenimiento (atención y bitácora) e Incidencias (sólo en «Reportes del laboratorio») incluyen un panel plegable «Exportar CSV / PDF» con los mismos formularios (`ReportDownloads` → `ReportForm`) y la misma ruta de descarga. Sólo aparece si el usuario tiene el permiso de alguno de esos reportes. Un periodo inválido regresa a la página central con el motivo. Decisión del responsable del 7 de octubre de 2026: ofrecer ambos accesos.

## Despliegue

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm test:integration
pnpm build
```

Añade `pdf-lib` 1.17.1. No hay migración ni variables de entorno nuevas.
