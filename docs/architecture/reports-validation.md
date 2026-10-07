# Validación de Reports I

Fecha: 7 de octubre de 2026. Node.js 24.21.0, pnpm 11.19.0 y lockfile actualizado sólo con `pdf-lib` 1.17.1 (y sus dependencias `pako`, `tslib`, `@pdf-lib/standard-fonts`, `@pdf-lib/upng`). Rama `feat/reports-i` desde `5d66b2a`, en un worktree propio. SRS original sin cambios. Sin migraciones: no se ejecutó `pnpm db:generate` ni `pnpm db:migrate`.

## Comandos ejecutados

| Comprobación                              | Resultado                                                                                           |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `pnpm check`                              | Correcto: ESLint, TypeScript, 78 pruebas unitarias/configuración (67 previas + 11) y Prettier.      |
| `pnpm test:integration`                   | Correcto: 168 resultados, cero fallos, PostgreSQL real en la base `_test` (162 previos + 6 nuevos). |
| `pnpm build`                              | Correcto; incluye `/app/labs/[slug]/reports` y `/app/labs/[slug]/reports/[report]`.                 |
| `pnpm test:e2e tests/e2e/reports.spec.ts` | Correcto: 8 pruebas (4 escenarios × escritorio y móvil).                                            |
| `pnpm test:e2e`                           | Correcto: 32 pruebas; ficha y secciones modificadas no rompen Maintenance, Documents ni Loans.      |

Además se generó y revisó visualmente un PDF de préstamos con 40 filas y 14 columnas: paginación (4 páginas), encabezado repetido, acentos, alineación numérica y ajuste de texto correctos.

## Cobertura

Unitarias (`tests/reports.test.ts`, 11):

- Claves y formatos cerrados.
- Periodo con offset, positivo y de hasta 366 días; descripción en fechas locales inclusivas.
- Hora local ordenable.
- CSV: comillas, saltos de línea, BOM, CRLF y neutralización de fórmulas sólo en texto.
- Estado de préstamo (activo, vencido, devuelto) calculado al generar.
- Motivos de atención (estado operativo, vencido, próximo).
- Catálogo filtrado por permisos; permiso propio de cada reporte; horizonte de 30 días.
- Periodo validado antes de leer; rechazo de más de 5000 filas; identificadores inválidos.
- PDF paginado, título en metadatos, texto fuera de WinAnsi sin fallar, reporte vacío y nombre de archivo.
- Adaptador web: conversión de fechas locales inclusivas, cabeceras de descarga, BOM en bytes, fechas inexistentes y formatos inválidos.

Integración (`tests/integration/reports.test.ts`, PostgreSQL):

- Stock = existencia − préstamos pendientes con aritmética exacta, sólo del laboratorio.
- Movimientos, préstamos (devuelto por condición), mantenimiento con materiales e incidencias dentro del periodo; un periodo pasado no devuelve filas.
- Recursos fuera de servicio y con mantenimiento próximo; los de otro laboratorio no aparecen.
- Otro laboratorio sólo ve sus propias filas.
- Un miembro sin permisos de lectura obtiene catálogo vacío y `AuthorizationDeniedError`.

End-to-end (`tests/e2e/reports.spec.ts`): enlace desde la ficha, catálogo limitado a los reportes de `inventory.read`, descarga CSV con contenido exacto (incluida una celda con coma y comillas), descarga PDF válida, descarga desde el panel «Exportar CSV / PDF» de Inventario, periodo invertido que regresa con alerta accesible, y 404 en página y descarga para un miembro sin permisos. Sin desbordamiento horizontal en móvil.

## Limitaciones conocidas

- PDF con fuentes estándar: caracteres fuera de WinAnsi (emoji, algunos símbolos) se imprimen como `?`. El CSV conserva el texto completo.
- Sin paginación del lado del servidor más allá del límite de 5000 filas.
- Los reportes no se auditan (ADR 0018 D7).
- Las decisiones D1–D7 siguen en estado Propuesta.
