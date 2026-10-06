# Recorrido de Attendance I y Usage I

Usar PostgreSQL local con configuración de integración separada `_test` y build de producción. No ejecutar junto con integración, cuyos controles esperan cuentas sin fixtures.

```bash
pnpm build
pnpm exec node --import tsx tests/e2e/attendance-usage-browser-fixture.ts
```

El JSON contiene rutas, correos/contraseña sintéticos y fixturePid. Abrir checkInPath en localhost:3108 sin sesión, verificar login con retorno al destino, entrar como alumno y confirmar asistencia. Repetir confirmación y comprobar una sola constancia/hora original. Abrir usagePath: todavía vacío. Seleccionar maquinaria/contexto, iniciar y terminar; comprobar intervalo persistido.

Cerrar sesión y entrar como manager. Abrir rosterPath, corregir estado con motivo y verificar hora original y evento con actor. Abrir tracePath y comprobar identidad/recurso/intervalo con la aclaración de responsabilidad. Revisar pantalla móvil y consola. Casos de múltiples candidatos, contextos manipulados, permisos y carreras se verifican en integración.

Al finalizar, enviar SIGTERM al fixturePid del JSON (al proceso Node de la fixture), esperar el mensaje de limpieza y comprobar cero usuarios de esa fixture. No cerrar abruptamente el envoltorio pnpm/tsx. Nunca usar cuentas o credenciales reales ni la base de desarrollo para este recorrido.

Resultados ejecutados: [validación](../../docs/architecture/attendance-usage-validation.md).
