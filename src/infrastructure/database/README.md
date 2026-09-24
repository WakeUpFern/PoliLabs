# Persistencia

Configuración de PostgreSQL con Drizzle y `pg`. `getDatabase()` es exclusivo del servidor, inicializa el pool bajo demanda y reutiliza el pool durante recargas de desarrollo. No se invoca desde la página inicial.

`schema.ts` está vacío deliberadamente. Cuando se apruebe el primer modelo, exportar sus tablas aquí, ejecutar `pnpm db:generate`, revisar SQL y guardar la migración en Git. Aplicar con `pnpm db:migrate` sobre la base local. No usar `push` como sustituto del historial de migraciones. No ejecutar migraciones durante requests ni al compilar.

`pnpm db:check` realiza solamente `select 1` con Drizzle. No demuestra integridad de un módulo ni crea tablas. Las pruebas de transacciones y concurrencia se añadirán contra PostgreSQL real al implementar esos casos de uso.
