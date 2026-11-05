# 0025 — Dock del celular con botón central de creación

Estado: **Aceptada** (5 de noviembre de 2026, a petición del responsable). Modifica la D1 (barra inferior) y la D2 (el «+» del encabezado) del [ADR 0023](0023-single-navigation-and-institutional-palette.md).

## Contexto

El ADR 0023 dejó en el celular una barra inferior con Inicio, tres secciones y «Más», y un «+» en el encabezado guinda con cuatro acciones (nueva práctica, reservación, reportar falla, agregar persona). El responsable pidió conservar la barra abajo pero darle mejor diseño: las opciones comunes a los lados y el «+» en el centro del dock, con acciones de creación que dependan de quién la use (el profesor crea prácticas y sesiones; el alumno reserva) sin limitarse a esas.

La revisión con la skill _design-taste-frontend_ (`references/app-screens.md`) pide superficies planas, sin sombras ni brillos en reposo, y un botón flotante sólo si es la acción principal de la pantalla y no tapa nada.

## Decisión

**D1 — Dock de cuatro destinos y un botón central.** Debajo de 1024 px la barra muestra Inicio y una sección a la izquierda, el botón «Crear» al centro, y otra sección y «Más» a la derecha. `quickSections` elige ahora dos secciones con los mismos permisos de antes: quien administra existencias ve Incidencias e Inventario; quien administra prácticas, Prácticas y Asistencia; el resto, Prácticas y Reservaciones. Lo demás sigue en «Más».

**D2 — El botón es plano y no flota sobre el contenido.** Es un círculo guinda de 52 px que sube 18 px sobre la barra dentro de una «cuna» blanca que continúa la línea superior de la barra. Sin sombra ni brillo. El contenido conserva su margen inferior, así que el botón nunca tapa la última fila.

**D3 — Una sola lista de creación, decidida por permisos.** `createActions` reúne todo lo que una persona puede iniciar, cada acción con una línea de ayuda y la sección a la que pertenece: nueva práctica y programar sesión (`academic.manage`), reservar (`reservation.create`), registrar asistencia (`attendance.checkin`), usar una máquina (`usage.record`), prestar herramienta (`inventory.loan`), nuevo artículo (`inventory.manage`), registrar mantenimiento (`maintenance.create`), reportar una falla (`incident.create`) y agregar persona (`laboratory.membership.manage`). El orden sigue al rol: el profesor empieza por prácticas y sesiones, el alumno por reservar y asistencia, y quien administra existencias por inventario, préstamo, mantenimiento y fallas.

**D4 — El contexto manda primero.** `actionsFor` pone primero las acciones de la sección abierta (en Incidencias, «Reportar una falla» encabeza la lista) y deja las demás en su orden.

**D5 — Mismo contenido en celular y escritorio.** En el celular el botón abre una hoja inferior (`<dialog>`, igual que «Más») titulada «Crear». Desde 1024 px el «+» sigue en el encabezado y abre la misma lista como menú emergente; en el celular el «+» del encabezado desaparece.

## Alternativas consideradas

- Mantener cinco destinos más el botón central: en 360 px cada destino queda en unos 50 px y las etiquetas se cortan.
- Abrir las acciones como abanico de botones sobre el dock: no cabe con diez acciones posibles y no admite la línea de ayuda.
- Dejar el «+» en el encabezado: fuera del alcance del pulgar y repetido con el botón central.

## Consecuencias

- Cada rol pierde un acceso directo del dock (Reservaciones para el profesor, Préstamos para el alumno y el responsable), que queda en «Más»; reservar y prestar siguen a un toque desde «Crear».
- Algunas acciones llevan a la página donde se elige el objeto (programar sesión elige la práctica; prestar, la herramienta; mantenimiento, el equipo), porque esos formularios viven en el detalle de cada objeto.
- Si cambia el catálogo de permisos, cambia lo que ofrece «Crear»; las pruebas unitarias fijan la lista por rol.

## Referencias del SRS

- §24 (autorización por permisos, no por rol), igual que el ADR 0023.
