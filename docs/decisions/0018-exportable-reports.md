# 0018 — Reportes exportables en CSV y PDF

Estado: **Aceptada** (7 de octubre de 2026; decisiones D1–D7 aprobadas explícitamente por el responsable)

## Contexto

El responsable pidió el 7 de octubre de 2026 iniciar la implementación de los reportes exportables. Las decisiones D1–D7 de este ADR se tomaron como propuesta razonable para el primer corte (Reports I), el código la implementa y el responsable la aprobó explícitamente el 7 de octubre de 2026.

[SRS](../srs/PoliLabs-SRS.tex) RF «generar reportes básicos por práctica, sesión, inventario, reservación, mantenimiento e incidencia» y «exportar información seleccionada en CSV y PDF»; §2 «consultar reportes y auditoría de acuerdo con permisos»; §32 lista nueve reportes mínimos; §33.15 exige «generar un reporte exportable». El SRS no define permisos, formato de columnas, límites ni periodicidad de los reportes. [ADR 0006](0006-laboratory-scope.md) exige acotar lecturas, listados y **exportaciones** al laboratorio y permisos del actor.

## Decisión

**D1 — Alcance de Reports I.** Seis reportes de §32 sobre módulos operativos ya implementados:

| Clave                 | Reporte (§32)                                         | Periodo                      |
| --------------------- | ----------------------------------------------------- | ---------------------------- |
| `inventory-stock`     | Stock actual de inventario                            | No (estado actual)           |
| `inventory-movements` | Movimientos de inventario                             | Sí, por fecha del movimiento |
| `loans`               | Préstamos y devoluciones                              | Sí, por fecha de préstamo    |
| `maintenance`         | Mantenimiento por recurso                             | Sí, por fecha de realización |
| `incidents`           | Incidencias y estado de seguimiento                   | Sí, por fecha de reporte     |
| `resource-attention`  | Recursos fuera de servicio o próximos a mantenimiento | No (estado actual)           |

Quedan para un corte posterior los reportes de práctica y sesiones, asistencia, reservaciones/utilización de espacios y uso de maquinaria.

**D2 — Permisos.** Cada reporte exige el permiso de lectura que ya protege esos datos en la interfaz; no se crea un permiso `report.*`:

| Reporte                                        | Permiso            |
| ---------------------------------------------- | ------------------ |
| `inventory-stock`, `inventory-movements`       | `inventory.read`   |
| `loans` (incluye nombres de prestatarios)      | `inventory.loan`   |
| `maintenance`, `resource-attention`            | `maintenance.read` |
| `incidents` (incluye nombres de quien reporta) | `incident.review`  |

El catálogo de la página sólo muestra los reportes permitidos; sin ninguno, la página y la descarga responden 404. Los reportes de «lo propio» (préstamos o incidencias propias) no se ofrecen en este corte.

**D3 — Formatos.**

- CSV: RFC 4180, UTF-8 con BOM (para que hojas de cálculo respeten acentos), CRLF, una fila de encabezados. Las celdas de texto capturado por usuarios que empiezan con `=`, `+`, `-`, `@`, tabulador o retorno se prefijan con `'` para neutralizar fórmulas. Cantidades con tres decimales exactos (`numeric(18,3)`), fechas como `AAAA-MM-DD HH:mm`.
- PDF: generado en servidor con `pdf-lib` 1.17.1 (JavaScript puro, sin binarios ni fuentes externas), carta horizontal, Helvetica estándar (WinAnsi: los caracteres fuera de ese juego se imprimen como `?`), encabezado con laboratorio, periodo, fecha y autor de la generación, notas de cálculo, columnas repetidas por página y «Página X de Y». Las celdas se ajustan a su columna con un máximo de ocho líneas.
- No se ofrece Excel nativo.

**D4 — Generación y entrega.** Síncrona por solicitud en un route handler `GET /app/labs/[slug]/reports/[report]?format=csv|pdf&from&to`, que revalida sesión, laboratorio y permiso en cada descarga. No se almacena el archivo (ni en disco ni en S3), no hay caché (`Cache-Control: private, no-store`) ni colas. Límites: 5000 filas y 366 días; un reporte mayor se **rechaza** pidiendo acotar el periodo, nunca se trunca en silencio. Las mismas descargas se ofrecen desde la página central del laboratorio y desde un panel en cada sección (Inventario, Préstamos, Mantenimiento, Incidencias), según eligió el responsable el 7 de octubre de 2026. Errores de periodo o tamaño regresan al formulario de la página central (303); permiso denegado, laboratorio ajeno o reporte desconocido responden 404 indistinguibles.

**D5 — Lectura entre módulos y consistencia.** `modules/reports` es un modelo de lectura: su adaptador Drizzle consulta tablas de Inventory, Loans, Maintenance, Incidents, Spatial e Identity **sólo para leer**, siempre filtrando por el laboratorio autorizado. No reutiliza los listados de cada módulo porque están limitados a 100 filas y moldeados para la UI. Cada exportación ocurre en una sola transacción REPEATABLE READ tras `authorizeLocked`, de modo que existencia y préstamos pendientes, o bitácoras y materiales, salen de la misma instantánea.

**D6 — Tiempo.** Fechas y horas se muestran en America/Mexico_City (política inicial del ADR 0009). El formulario recibe fechas locales inclusivas; la capa web las convierte a un intervalo `[desde 00:00, hasta+1 00:00)` con offset y el servicio sólo acepta instantes con offset. «Próximo a mantenimiento» significa que la última bitácora del recurso prevé el siguiente mantenimiento en 30 días o antes (incluye vencidos). «Vencido» de préstamos se calcula al generar, como en Loans I.

**D7 — Auditoría y datos personales.** Generar un reporte no se registra: §25 no lista exportaciones entre las acciones auditables y no existe auditoría persistente. Los reportes sólo incluyen nombres de usuario, nunca correos ni identificadores internos. Queda pendiente decidir si las exportaciones con datos personales deben auditarse cuando exista Audit.

## Alternativas

- Permiso propio `report.export` además del de lectura: añade control sobre la extracción masiva, pero duplica la matriz de permisos sin requisito explícito. Puede añadirse después sin cambiar los servicios.
- Reutilizar los servicios de listado de cada módulo: limitados a 100 filas y con formas pensadas para tarjetas; habría que ampliarlos módulo por módulo.
- PDF desde el navegador (vista imprimible): no produce un archivo descargable uniforme ni sirve a Giussepe o a futuros envíos.
- `pdfkit`: mantiene fuentes AFM en disco que requieren configurar el empaquetado de Next; `pdf-lib` las incrusta en el código.
- Generación asíncrona con almacenamiento en S3: innecesaria para el volumen de un laboratorio y requiere infraestructura no aprovisionada.
- Truncar al límite: produce reportes incompletos que parecen completos.

## Consecuencias

- Módulo nuevo `src/modules/reports` (dominio, aplicación, infraestructura, web), página `/app/labs/[slug]/reports`, route handler de descarga y enlace «Reportes» en la ficha del laboratorio.
- Dependencia nueva `pdf-lib` 1.17.1 fijada. Sin migraciones, tablas, permisos ni variables de entorno nuevas.
- Futuras herramientas de Giussepe pueden invocar `ReportService.generate` con el mismo contexto y permisos y recibir la tabla estructurada.
- Los reportes leen columnas de otros módulos: un cambio de esquema en ellos debe revisar `reports/infrastructure/report-store.ts`; las pruebas de integración lo detectan.
- Fuera de alcance: reportes académicos, de asistencia, reservaciones y uso; filtros adicionales (por recurso, estado, persona); programación o envío por correo; Excel; firma o sellado institucional; auditoría de exportaciones.

## Referencias SRS

RF (reportes básicos y exportación CSV/PDF), §2, §25, §31, §32, §33.15; RNF9. ADR 0003, 0006, 0009, 0010, 0014, 0015, 0017. Ver [arquitectura](../architecture/reports.md) y [validación](../architecture/reports-validation.md).
