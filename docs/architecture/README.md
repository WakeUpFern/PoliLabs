# Arquitectura de Labora

## Estado y fuentes

Base técnica inicial; no es el MVP funcional del SRS. Labora es el nombre de la aplicación en esta sesión; PoliLabs se conserva como nombre del repositorio. La denominación definitiva es una decisión de producto pendiente.

Fuente de requisitos: [SRS V3 completo](../srs/PoliLabs-SRS.tex), fechado el 13 de agosto de 2026. La ruta solicitada `docs/srs/labora-srs.tex` no existe. Por decisión explícita del responsable del proyecto, el original y su PDF se conservan sin cambios en `docs/srs/`; Linux distingue mayúsculas. Ver ADR 0007.

Consultar el [índice de ADR](../decisions/README.md). «Aceptada» describe una decisión autorizada, no una función implementada. El SRS llama «propuesta» a parte del stack; las instrucciones de esta sesión ratifican TypeScript, Next.js, PostgreSQL, Drizzle, monolito modular y servicios compartidos. Los detalles cloud requieren evaluación futura.

## Organización y dependencias

```text
src/
  app/                         # Presentación y composición Next.js
  config/                      # Validación de configuración
  modules/
    academic/ spatial/ reservations/ inventory/
    maintenance/ incidents/ knowledge/ notifications/
    identity/ audit/            # Responsabilidades documentadas; sin lógica todavía
    <module>/domain/            # Reglas puras; identity tiene un README inicial
    <module>/application/       # Servicios; identity tiene un README inicial
  infrastructure/database/     # Cliente, punto de entrada de esquema y documentación
scripts/                       # Comprobación local de conexión
tests/                         # Pruebas automatizadas
docs/architecture/             # Arquitectura vigente y pendientes
docs/decisions/                # Historial de decisiones
```

La web invocará servicios de aplicación; estos validarán identidad, permisos, entradas, relaciones e invariantes, y coordinarán transacciones y adaptadores. El dominio no dependerá de React, HTTP, Drizzle o IA. Los adaptadores de persistencia pueden depender del dominio; las interfaces se introducirán solo cuando tengan una responsabilidad concreta. La composición del servidor conectará servicios y adaptadores.

Giussepe será otra interfaz: herramienta → mismo servicio de aplicación → autorización y revalidación → persistencia. No tendrá acceso SQL directo ni privilegios adicionales. No hay código de IA en esta base.

Se prefiere `infrastructure/database` a duplicar `core/database` del esquema sugerido en §11.2. Identidad y auditoría tienen un único lugar bajo `modules`. La estructura de carpetas es una convención inicial ajustable, no una nueva capa técnica.

## Dominios y relaciones del SRS

| Dominio       | Entidades y relaciones propuestas                                                                                                  | Requisitos principales    |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| Academic      | Práctica → sesiones; alumno ↔ sesión por asistencia; grupos y periodos                                                             | RF2–6, RB1, §17           |
| Spatial       | Space → planos, recursos y ubicaciones; Location → padre opcional; elementos del plano referencian recursos/ubicaciones            | RF7–9, RF17–19, §12       |
| Reservations  | Reservación → recursos mediante asociación; serie → ocurrencias; bloqueos independientes; referencias opcionales a práctica/sesión | RF10–14, RB5–9, §13       |
| Inventory     | Ítem → existencias y movimientos por ubicación opcional; préstamos temporales; unidades variables                                  | RF15–22, RB2–4, RB10, §14 |
| Maintenance   | Recurso → bitácoras; materiales utilizados vinculados a consumos                                                                   | RF25–27, §15              |
| Incidents     | Reporte → recurso/espacio/sesión conocidos; seguimiento y resolución                                                               | RF28–29, RB11–12, §16     |
| Knowledge     | Documento → metadatos, permisos, clave de objeto y asociaciones                                                                    | RF24, §18                 |
| Notifications | Usuario → notificaciones, preferencias, entregas y suscripciones                                                                   | RF30–33, §19              |
| Identity      | Usuario interno, perfil alumno opcional, roles compuestos por permisos e identidades externas futuras                              | RF1, §§23–24              |
| Audit         | Actor, entidad, acción, origen e historial relevante                                                                               | RNF9, §25                 |
| AI            | Interfaz de herramientas; no fuente de datos operativos                                                                            | RF36–38, §§20–21          |

Las tablas de §22 son sugeridas, no un esquema aprobado para migrar íntegro. Los recursos físicos individualizados no se deben duplicar como otra identidad independiente de inventario sin definir su relación. Grupos, periodos, organizaciones y membresías no están completamente especificados por la lista de tablas.

## Aceptado, implementado y posterior

**Aceptado:** monolito modular, stack indicado, PostgreSQL autoritativo, servicios reutilizables, separación autenticación/autorización, control por permisos, trazabilidad útil y adaptadores externos. Ver ADR 0001–0005.

**Implementado:** App Router con una página informativa responsiva; TypeScript estricto; Tailwind; configuración de lint, formato y pruebas; validación de URL de base de datos sin revelar secretos; cliente Drizzle de servidor; esquema vacío; Compose para PostgreSQL local con la imagen `postgres:17-alpine`, volumen persistente, healthcheck y publicación en `127.0.0.1:5433`; script de lectura para comprobar conexión. PostgreSQL local y la conexión de Drizzle mediante `select 1` fueron verificados; ver el informe de validación de esta sesión.

**Posterior:** servicios de negocio, tablas y migraciones, autenticación, autorización ejecutable, auditoría, transacciones de negocio, archivos S3, correos, PWA, push, reportes y Giussepe. AWS y Bedrock no están aprovisionados ni conectados. shadcn/ui se evaluará cuando se necesiten componentes interactivos; no aporta valor instalarlo para una página estática.

## Integridad y seguridad que guiarán los módulos

RNF4–6 y §30 exigen restricciones, claves foráneas y transacciones. Una consulta de disponibilidad no garantiza una escritura posterior: la protección debe cubrir la operación concurrente completa. Se decidirán bloqueos, restricciones de exclusión, aislamiento e idempotencia al modelar reservaciones/inventario; no se afirma que esos controles ya existan.

Cada servicio recibirá contexto autenticado y verificará permisos y pertenencia al laboratorio. El proveedor de autenticación no sustituye estos controles. No se deben exponer operaciones sin autorización por tener una UI provisional. Los efectos de notificaciones se desacoplan mediante eventos (§19); la entrega durable y el mecanismo de reintento se decidirán antes de implementarlos. No hay bus ni cola en esta etapa.

## Decisiones pendientes y consecuencias

- **Múltiples laboratorios:** `spaces.organization_id` aparece sin entidad organizacional ni membresías completas (§22). Falta decidir propiedad, alcance de permisos y catálogos compartidos. ADR 0006 es propuesta; resolver antes de la primera migración funcional.
- **Identidad:** cuentas locales son una capacidad V1; no se ha elegido biblioteca, política de altas ni proveedor. Cognito es opcional; Entra ID depende de autorización institucional. No asumir integración IPN.
- **Atomicidad de mantenimiento y consumo:** §15 menciona transacción independiente vinculada, mientras RNF5–6 exige integridad. Definir si ambas escrituras son atómicas o si se admiten estados parciales y compensaciones antes de implementar ese flujo.
- **PWA:** §3.1 y RNF2 la incluyen, pero §34.2 la sitúa en V1.5. Se aplaza según el alcance explícito de esta sesión; confirmar la aceptación de cada entrega futura.
- **Modelo incompleto:** §16 permite incidentes asociados a espacios, pero el ejemplo de campos en §22.2 no incluye `space_id`; grupos, periodos, asignación de roles y vínculo activo/ítem requieren modelado. No copiar el listado como contrato completo.
- **Tiempo y recurrencia:** faltan zona horaria persistida, límites de intervalos y reglas de cancelación/excepciones. Resolver al abordar reservaciones.
- **AWS:** S3 y destino AWS están acordados, Bedrock previsto; topología, región, costos, SES/CloudWatch/CDK y posible AgentCore se evaluarán al desplegar. §35 pide validar adopción final. Sin recursos pagos en esta sesión.
- **Edición del SRS:** numeración de flujos 27.x bajo §28 y referencias V1/V3 requieren revisión editorial futura. No se han corregido ni movido los originales.

## Siguiente incremento recomendado

Acordar el alcance de laboratorio/organización y membresías, y elegir la estrategia de cuentas locales. Después implementar un primer corte pequeño de Identity con permisos de aplicación y pruebas; luego un catálogo Spatial mínimo de espacios. Esto proporciona una base autorizada para prácticas y reservaciones sin iniciar todavía esos módulos. La selección y aceptación del siguiente módulo corresponden al responsable del proyecto.
