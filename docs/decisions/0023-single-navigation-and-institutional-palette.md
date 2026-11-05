# 0023 — Navegación única por tamaño de pantalla y paleta institucional

Estado: **Aceptada** (3 de noviembre de 2026; el responsable pidió aplicar el análisis de UX que la propone). Reemplaza la decisión D7 del [ADR 0022](0022-laboratory-people-and-guided-navigation.md) en lo que toca a la navegación, el encabezado y el inicio.

> El dock del celular y el «+» se actualizaron en el [ADR 0025](0025-mobile-dock-create-button.md).

## Contexto

El ADR 0022 copió dos patrones de GitHub: pestañas con ícono bajo el encabezado y un menú lateral oculto. En GitHub muestran cosas distintas (las pestañas son las secciones del repositorio y el menú lateral es la navegación global), pero en Labora ambos tenían las mismas doce secciones del laboratorio. El menú quedó como una copia de la tira, y la tira no cabía: en 1280 px se cortaba «Personas» y en un celular sólo se veían tres pestañas y media, sin indicio de que hubiera más.

Al revisar la interfaz con las reglas de la skill _ui-ux-pro-max_ («no mezclar pestañas y menú lateral en el mismo nivel», «separar navegación principal y secundaria», «barra inferior de cinco elementos como máximo», «barra lateral desde 1024 px», «objetivos táctiles de 44 px»), el responsable confirmó que sobraba uno de los dos y pidió aplicar la propuesta. También eligió una paleta con los colores del IPN y de UPIITA, con barra superior guinda y el logo de UPIITA en lugar de la «L».

## Decisión

**D1 — Una sola navegación por tamaño de pantalla.**

- **Desde 1024 px:** barra lateral fija (`.sidebar`) con «Inicio» y las secciones agrupadas por intención: _Día a día_ (Prácticas, Reservaciones, Asistencia, Uso de equipo, Préstamos), _Cuidado del laboratorio_ (Incidencias, Mantenimiento, Inventario, Espacios) y _Administración_ (Reportes, Personas). Dentro de cada grupo se conserva el orden de una práctica.
- **Debajo de 1024 px:** barra inferior (`.bottom-bar`) con Inicio, tres secciones y «Más». «Más» abre una hoja inferior (`<dialog>`) con la misma lista agrupada. Las tres secciones se eligen con permisos (`quickSections`): quien administra existencias (`inventory.manage`) ve Incidencias, Inventario y Préstamos; quien administra prácticas (`academic.manage`), Prácticas, Asistencia y Reservaciones; el resto, Prácticas, Reservaciones y Préstamos.
- Se eliminan la tira de pestañas y el menú lateral oculto. La lista completa se llama «Secciones del laboratorio» en los dos tamaños.

**D2 — La cuenta vive en el avatar.** Las iniciales abren un menú con nombre y correo, Mis laboratorios, Notificaciones, Contraseña, «Tus laboratorios» (si hay más de uno) y Cerrar sesión, separado del resto. El encabezado conserva «+» y la campana.

**D3 — Paleta IPN y UPIITA.** Tokens en `globals.css`: `guinda` `#6c1d45` (barra superior, acción principal, enlaces; 11:1 sobre blanco), `guinda-deep` `#4f1330`, `guinda-tint` `#f6e9ef`, `oro` `#866f16` (4.9:1 sobre blanco), `oro-light` `#e8d48a` (7.5:1 sobre guinda) y `carbon` `#333333`. La barra superior es guinda, sin filete, con el símbolo de UPIITA (`public/brand/upiita-mark.png`, recortado del logo sin el texto, que no se lee a 32 px). Los grises sueltos de Tailwind (`stone-*`) se sustituyen por `line`, `muted`, `ink` y `paper`.

**D4 — Un solo estilo de botón.** Todas las páginas usan `.btn` (borde, secundario), `.btn-primary` (guinda, una por vista), `.btn-outline` y `.btn-danger`, con radio de 6 px. Botones, íconos y filas del menú miden 44 px debajo de 1024 px y 36 px con ratón.

**D5 — Menos texto repetido.** Las páginas de primer nivel ya no tienen el enlace «← Laboratorio», porque la navegación marca dónde está la persona; las páginas internas conservan el regreso a su sección. Las descripciones no repiten el nombre del laboratorio. El inicio abre con «Hola, nombre» y el rol en una línea, con la acción principal a la derecha, y da todo el ancho a las cajas.

**D6 — Pantallas concretas.** En Reservaciones, espacio y recurso se aplican al cambiar (sin «Mostrar»), la explicación pasa a la leyenda bajo el calendario y la vista de un día no repite la fecha. En Inventario, la búsqueda filtra al escribir (la URL sigue siendo la fuente) y «Exportar» es un botón secundario junto a «Nuevo artículo». Las exportaciones de cada sección se abren desde un botón «Exportar».

## Alternativas consideradas

- Conservar las pestañas y quitar el menú lateral: en celular las pestañas siguen sin caber y ocultan secciones sin avisar.
- Conservar el menú lateral oculto y quitar las pestañas: toda navegación cuesta dos toques y no se ve dónde está la persona.
- Barra inferior igual para todos: el alumno vería Inventario o Personas, que no usa.
- El sistema de diseño que generó la skill (verde azulado con tipografía Garamond): contradice la identidad IPN/UPIITA.
- Logo completo con «upiita-ipn»: el texto no se lee a la altura de la barra.

## Consecuencias

- Las doce secciones caben en escritorio y queda espacio para nuevas. En celular, las secciones menos usadas están a dos toques.
- Las pruebas e2e entran a una sección con `openSection` (`tests/e2e/support/navigation.ts`), que usa la barra lateral o «Más» según el tamaño.
- `quickSections` decide con permisos; si cambia el catálogo de roles, puede cambiar lo que ve cada persona en la barra inferior.
- Los colores de estado (verde, ámbar, rojo) y los bloques del calendario no cambian.

## Referencias SRS

- §8.1–8.2: interfaces de alumno y profesor.
- §24: decisiones por permisos, no por rol.
