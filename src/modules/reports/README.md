# reports

Reports I implementa reportes exportables en CSV y PDF (SRS §32, §33.15) como modelo de lectura: consulta tablas de Inventory, Loans, Maintenance, Incidents y Spatial sin escribir en ellas, siempre acotado al laboratorio y al permiso de lectura de cada reporte.

Ver [arquitectura](../../../docs/architecture/reports.md), [validación](../../../docs/architecture/reports-validation.md) y [ADR 0018 — Aceptada](../../../docs/decisions/0018-exportable-reports.md). No almacena archivos, no usa S3 ni registra exportaciones.
