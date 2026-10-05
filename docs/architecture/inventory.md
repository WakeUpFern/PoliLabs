# Inventory I — Catálogo y existencias por cantidad

Fecha: 5 de octubre de 2026. Estado: implementado; resultados de ejecución en [validación](inventory-validation.md). Alcance aprobado en [ADR 0010](../decisions/0010-quantity-inventory.md).

## Alcance y requisitos

Catálogo de consumibles y herramientas reutilizables por Laboratory, búsqueda/listado, alta, edición y desactivación lógica, existencia inicial, compras/entradas, consumo, daño, pérdida, ajuste de entrada/salida, saldo e historial. SRS RF15, RF17–19, RF21–22, §14.2–4, RB2–3 y RB10, RNF4–6/RNF9, §§24–25 y 30. RF16 se cubre parcialmente: activos individualizables quedan pendientes; RF20/préstamos también. Este incremento no completa el MVP de §33.

Resource permanece en Spatial; no se duplica maquinaria como artículo por cantidad. No se ofrecen préstamos, devoluciones de préstamos, transferencias, múltiples ubicaciones simultáneas, planos, notificaciones de mínimos, reportes/exportación ni Giussepe. No hay recursos AWS ni nuevas dependencias de UI.

## Modelo y cantidades

- `inventory_items`: UUID, Laboratory explícito, nombre, tipo, unidad, activo y fechas. Los nombres no son únicos; buscar ayuda a detectar duplicados, sin bloquear nombres legítimamente iguales.
- `inventory_stocks`: una fila obligatoria por artículo, con `item_id` como PK, cantidad y `location_id` nullable. La PK impide saldos duplicados incluso sin ubicación. Esta elección deliberada simplifica §14.3; múltiples saldos requerirán una migración posterior.
- `inventory_movements`: artículo y laboratorio coherentes por FK compuesta, ubicación al registrar, tipo, cantidad positiva, saldo anterior/posterior, actor, motivo, origen y fecha.
- `inventory_events`: alta, edición y desactivación del catálogo con actor, origen, fecha y snapshot resultante. Complementa movimientos sin implementar un subsistema genérico de auditoría.

Las unidades iniciales son `piece`, `metre`, `litre` y `kilogram`. Herramientas reutilizables sólo usan piezas; cualquier artículo contado en piezas requiere enteros. Las cantidades usan `NUMERIC(18,3)`, de 0 a 999999999999999.999; las operaciones exigen magnitud positiva. Dominio/API reciben cadenas decimales y calculan milésimas con BigInt; no se usa Number para cantidades. Hasta tres decimales; no hay conversión de unidades. El API rechaza notación científica, NaN y precisión excedente. PostgreSQL NUMERIC puede redondear entradas SQL con más de tres decimales: el acceso operativo siempre pasa por la validación del servicio.

## Políticas del corte

Se puede crear un artículo sin ubicación ni movimientos, con saldo cero. Alta con cantidad inicial positiva requiere motivo y permisos de catálogo y movimientos; artículo, saldo, evento y movimiento se confirman o revierten juntos. `initial` sólo se acepta en el servicio de alta y debe ser el primer movimiento.

Compras, entradas y ajustes de entrada suman; consumo, daño, pérdida y ajustes de salida restan. No existe edición directa de saldo ni actualización/borrado de movimientos por servicios. Corregir una operación exige otro movimiento con motivo. Los movimientos de consumo no se permiten para herramientas reutilizables. No se presenta su saldo como disponibilidad de préstamos.

Nombre y ubicación principal pueden editarse; tipo y unidad quedan fijos después del primer movimiento, incluso si el saldo vuelve a cero. Cambiar la ubicación refina/reasigna la referencia principal del único saldo; los movimientos conservan su Location original. No equivale a una transferencia entre saldos. Eventos registran la nueva referencia; las FK conservan identidades históricas, pero nombres y jerarquía se presentan desde el catálogo actual, no como una copia histórica de sus etiquetas.

Desactivar un artículo requiere saldo cero. La desactivación es idempotente y conserva detalle/historial; no hay reactivación ni borrado físico en la interfaz. Listados muestran activos por defecto y permiten incluir desactivados. Una Location o Space con saldo positivo no puede desactivarse. Con saldo cero se conserva la FK histórica aunque la ubicación deje de estar activa; nuevas entradas exigen una ubicación activa o ninguna.

## Servicios y autorización

`ListInventory`, `GetInventoryItem`, `CreateInventoryItem`, `UpdateInventoryItem`, `DeactivateInventoryItem` y `RecordInventoryMovement` viven en application; reglas y aritmética en domain, Drizzle/SQL en infrastructure. El contrato transaccional `InventoryStore.run` delimita cada caso de uso; el adaptador bloquea la ruta concreta de permisos y reutiliza `AuthorizationService` dentro de esa transacción. El servicio coordina validación, permisos y operaciones, sin React/HTTP/SDK de IA en el dominio.

Permisos locales nuevos: `inventory.read`, `inventory.manage`, `inventory.adjust`. Se incorporan al bootstrap y al rol inicial `laboratory_responsible` mediante migración. No se concede `inventory.loan` anticipadamente. Identificadores y relaciones se acotan al laboratorio; ser miembro de dos laboratorios no permite mezclar sus entidades. Actor y origen no se aceptan desde formularios: el adaptador resuelve la sesión y fija `WEB`. Futuras herramientas deben resolver su identidad y pasar `AGENT` desde código confiable.

El selector y las etiquetas de ubicación usan `ListSpaces`/`ListLocations` con sus permisos existentes. Sin visibilidad espacial se puede consultar inventario, crear artículos sin ubicación y registrar movimientos; se presenta una etiqueta de ubicación fuera del catálogo visible. El formulario no permite asignar una Location que no aparezca en su catálogo autorizado. Los servicios vuelven a validar actividad y laboratorio en PostgreSQL, independientemente del formulario.

## Transacciones e integridad

Migración `0005_foamy_the_anarchist.sql`, con snapshot/journal Drizzle. El índice único compuesto se crea antes de la FK que lo referencia. SQL generado revisado y extendido con triggers y alta de permisos; no se usa schema push.

Las escrituras requieren READ COMMITTED. Bloqueo por artículo serializa movimientos y cambios de catálogo; lecturas de detalle también bloquean el artículo para que saldo e historial sean coherentes. Las lecturas de listado son del estado confirmado, sin promesa de reservar el saldo mostrado. La ruta de permisos queda protegida hasta commit contra revocaciones concurrentes. Las ubicaciones/espacios seleccionados se bloquean contra desactivación durante la operación.

Un trigger BEFORE INSERT de movimientos calcula saldo anterior/posterior y actualiza la existencia. CHECKs protegen magnitud, tipos, unidades y saldo no negativo. Triggers diferidos concilian saldo con la suma de movimientos e impiden cambios silenciosos o borrado de historial de artículos existentes. Actualizaciones de movimientos/eventos están prohibidas. Sólo el desmontaje administrativo completo de un artículo y todos sus dependientes en una misma transacción puede retirar su historial; no hay servicio ni UI para ello. Las pruebas usan esa excepción para eliminar exclusivamente fixtures sintéticos en la base separada `_test`; no representa autorización para borrar datos operativos.

Las transacciones inválidas revierten todas sus operaciones. No hay reintento automático ni clave de idempotencia persistente para movimientos en este corte; el formulario bloquea el envío mientras está pendiente. Una integración futura con reintentos deberá definir su identidad de operación antes de habilitarlos.

Spatial incorpora sólo la protección necesaria de desactivación y su traducción a mensajes de dominio/UI. Los demás módulos conservan su comportamiento.

## Interfaz y repetición

- `/app/labs/[slug]/inventory`: búsqueda por nombre sin distinguir mayúsculas, filtro de tipo y opción de incluir desactivados.
- `/app/labs/[slug]/inventory/new`: alta, ubicación opcional, cantidad inicial y motivo según permisos.
- `/app/labs/[slug]/inventory/[itemId]`: saldo, ubicación jerárquica, historial, movimientos, edición y desactivación según permisos/estado.

Server Components para lecturas; un componente cliente con useActionState para formularios y Server Actions que vuelven a autenticar e invocan InventoryWeb/servicios. Horarios del historial en America/Mexico_City. Errores esperados muestran mensajes operativos y no SQL/credenciales. La búsqueda y el historial todavía no tienen paginación.

```bash
pnpm db:migrate
pnpm check
pnpm test:integration
pnpm build
pnpm dev
```

La migración es aditiva, pero instala guardas sobre desactivaciones espaciales; debe desplegarse con el código del mismo incremento. Requiere PostgreSQL local y la configuración existente de `.env.example`; no introduce variables nuevas.
