# 0021 — Reservación interactiva desde la cuadrícula del calendario

Estado: **Propuesta** (16 de octubre de 2026; implementada en Reservations IV a petición del responsable, pendiente de aprobación explícita del diseño)

## Contexto

El [ADR 0020](0020-floor-plans-calendar.md) añadió un calendario de ocupación de sólo lectura en una página aparte; reservar seguía exigiendo el formulario de Reservations II. El responsable pidió que la propia sección Reservaciones muestre una cuadrícula tipo calendario (estilo Google Calendar, Outlook o Notion) y que reservar consista en interactuar con ella, en computadora y en celular, viendo las franjas ocupadas. §13.5 pide que el mismo motor alimente calendario de día, semana o mes y lista de reservaciones; el SRS pide una interfaz web responsiva.

## Decisión

**D1 — Reservaciones abre en el calendario.** `/app/labs/[slug]/reservations` muestra por defecto la cuadrícula del Space (y Resource opcional) con vistas Día, Semana y Mes; «Mis reservaciones» queda como pestaña (`?tab=mine`). `/reservations/calendar` redirige a `/reservations` conservando la consulta. El formulario `/reservations/new` se mantiene como alternativa accesible por teclado y para enlaces prellenados desde el plano.

**D2 — Cuadrícula de 30 minutos.** Día y semana son una rejilla de franjas de 30 minutos en hora de pared de America/Mexico_City. Las reservaciones se dibujan por minutos, recortadas al día y en carriles cuando se superponen (`layoutDay`, función pura). La vista Mes queda de sólo lectura y cada día lleva a la vista Día. Las franjas pasadas se atenúan y una línea marca la hora actual.

**D3 — Selección según dispositivo.** Con ratón se arrastra sobre la columna del día para elegir el intervalo; con toque, un toque elige una hora a partir de esa franja y el desplazamiento vertical sigue funcionando (`touch-action: pan-y`). En teléfonos, si no se eligió vista, se abre la vista Día. Un botón «Nueva reservación» abre el panel en la siguiente franja de hoy, sin depender del puntero.

**D4 — Panel de reserva.** La selección abre un panel (hoja inferior en móvil, tarjeta lateral en escritorio) con fecha, inicio, duración y espacio completo o recursos. Con la ocupación ya cargada, el panel desactiva recursos en mantenimiento u ocupados y el botón cuando el espacio completo está ocupado. Estas indicaciones son sólo ayuda: el envío usa el mismo adaptador `submit` y `CreateReservation`, que revalida permisos, estado operativo y traslapes en PostgreSQL. Al crear, el panel se cierra, la página se revalida y la cuadrícula muestra el nuevo bloque sin salir del calendario.

**D5 — Privacidad.** Se mantiene el ADR 0020: las reservaciones ajenas se muestran como «Ocupado» con intervalo y recursos, sin id ni creador. La vista de ocupación expone además los ids de recursos visibles de cada reservación para que el panel distinga recursos libres; no añade datos personales.

## Alternativas consideradas

- Mantener el calendario de sólo lectura y el formulario: no responde a la petición del responsable.
- Biblioteca de calendario (FullCalendar u otra): añade dependencia y estilos ajenos para una rejilla sencilla; se puede reconsiderar si llegan recurrencia o arrastre de reservaciones existentes.
- Crear la reservación directamente al soltar, sin panel: impide elegir recursos y confirmar, y en móvil un toque accidental reservaría.
- Mover o redimensionar reservaciones arrastrándolas: requiere una operación de reprogramación que el dominio aún no tiene.

## Consecuencias

- Sin migraciones ni permisos nuevos; la cuadrícula es un componente de cliente sobre los servicios existentes.
- La selección con ratón o toque no es operable con teclado; el botón «Nueva reservación» y el formulario cubren ese caso.
- Pendientes: arrastrar para reprogramar, recurrencia, bloqueos de disponibilidad (RF14) y horario de apertura por Space para limitar la rejilla.

## Referencias SRS

§13.5, §33 criterio 6, RNF de interfaz web responsiva, RB5; amplía la interfaz del [ADR 0009](0009-individual-reservations.md) y del [ADR 0020](0020-floor-plans-calendar.md).
