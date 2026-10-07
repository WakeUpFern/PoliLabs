# Pruebas end-to-end

Fecha: 7 de octubre de 2026. E2E Foundations aprobado explícitamente por el responsable tras integrar Documents I y Loans I. `AGENTS.md` pide pruebas end-to-end de los flujos implementados; hasta ahora sólo había fixtures y guías manuales en `tests/e2e/`.

## Herramienta y ejecución

`@playwright/test` 1.63.0 (dependencia de desarrollo, versión fija). Navegador: Chromium de Playwright, descargado en `~/.cache/ms-playwright`; no requiere Chrome instalado. Dos proyectos: `desktop` (Desktop Chrome) y `mobile` (Pixel 7, viewport móvil).

```bash
pnpm exec playwright install chromium   # una vez por máquina
pnpm test:e2e                           # compila, levanta la app y ejecuta
pnpm test:e2e --project=desktop         # sólo escritorio
pnpm exec playwright show-report        # reporte HTML del último run
```

`pnpm test:e2e` no forma parte de `pnpm check` para que este siga siendo rápido. No ejecutar al mismo tiempo que `pnpm test:integration`: ambos usan la misma base `_test`.

## Aislamiento

- `playwright.config.ts` arranca `pnpm build && pnpm start` en el puerto 3200 (`E2E_PORT`) con `DATABASE_URL` apuntando a la base protegida `_test`, resuelta con la misma regla que la integración (`resolveTestDatabaseUrl`): nunca la base de desarrollo.
- `DOCUMENT_STORAGE_DIR` usa `.local-storage/e2e-documents`, que se borra al iniciar y al terminar.
- `globalSetup` crea y migra la base `_test` antes de las pruebas.
- Cada spec siembra su propio laboratorio sintético (`tests/e2e/support/seed.ts`): cuentas `invalid.test`, permisos explícitos por usuario (sin roles institucionales), catálogo e inventario, y lo elimina al final con una sola transacción que sólo toca ese laboratorio. Specs en serie con un worker.

## Sesiones

La primera prueba de Maintenance entra por el formulario de login real. Las demás reciben la cookie de sesión emitida en el proceso de sembrado con la misma configuración de Better Auth: repetir el login por UI en cada prueba activa el límite de intentos de inicio de sesión, que se mantiene habilitado.

## Cobertura actual

| Spec                  | Flujo                                                                                                                                                         |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `maintenance.spec.ts` | Entrada fuera de servicio con material, existencia insuficiente sin escritura, 404 sin permiso, recurso deshabilitado al reservar y vuelta a operación (RB5). |
| `documents.spec.ts`   | Subida por route handler, cabeceras de descarga, firma de bytes, origen ajeno, evidencia en bitácora inmutable, archivado y 404 uniformes.                    |
| `loans.spec.ts`       | Préstamo sin cambio de existencia, devolución con daño y cierre, vista de préstamos propios.                                                                  |
| `reports.spec.ts`     | Catálogo por permisos, descarga CSV con contenido exacto y PDF válido, periodo inválido con alerta y 404 sin permisos.                                        |

Todas comprueban ausencia de desbordamiento horizontal donde aplica. Las guías manuales de Academic, Attendance/Usage e Incidents siguen en `tests/e2e/*.md`; migrarlas a specs con `maintenance.spec.ts` como plantilla.

## Convenciones

- Selectores por rol y etiqueta accesible (`getByRole`, `getByLabel`); acotar al formulario o tarjeta cuando un texto se repite. Next inserta un anunciador de rutas con `role="alert"`: buscar alertas dentro del formulario.
- Verificar efectos persistentes cuando la UI no basta (p. ej. saldo con la conexión del sembrado), sin sustituir a la integración.
- Las reglas de concurrencia y restricciones se prueban en integración contra PostgreSQL, no en e2e.
