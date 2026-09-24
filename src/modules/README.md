# Módulos

Los directorios documentan límites futuros, no funcionalidades operativas. La lista deriva del SRS §7; AI será una interfaz transversal en `src/ai` cuando se implemente.

`identity/domain` y `identity/application` muestran la estructura con README, sin código funcional. Cada módulo incorporará `domain/` y `application/` con su primer caso de uso. No hay servicios vacíos, repositorios genéricos ni tablas anticipadas. La aplicación coordina permisos y transacciones; el dominio conserva reglas independientes de Next.js. Las interacciones entre módulos pasarán por servicios explícitos, no por componentes de UI.

Consultar [arquitectura](../../docs/architecture/README.md) antes de modificar límites.
