# Inventario compartido

El stock ya se valida y descuenta en PostgreSQL al confirmar una comanda, tanto desde salón como desde delivery o recojo. Agregar al carrito o guardar un borrador no reserva existencias. Cobrar y entregar no descuentan otra vez.

## Inventario de pollo a la brasa

Se almacena en octavos para trabajar con cantidades enteras y evitar errores de fracciones:

| Producto | Consumo por porción |
|---|---:|
| Pollo entero y Oferta | 1 pollo |
| Medio pollo | 1/2 pollo |
| Cuarto, pechuga a la brasa y combo de cuarto con anticucho | 1/4 pollo |
| Ofertón | 1 pollo + 1/4 |
| Súper Ofertón | 1 pollo + 1/2 |
| Mostro, Pollo loko, Combo extremo y cuarto a lo pobre | 1/4 pollo |
| Mostrito y Sabrosito | 1/8 pollo |

Las asociaciones se basan en los productos y descripciones existentes al instalar. El stock visible es el número máximo de porciones completas que puede prepararse con el saldo común; los máximos de distintas tarjetas no deben sumarse. Con un pollo pueden venderse un entero, dos medios o cuatro cuartos. El carrito y el editor de salón también contemplan las combinaciones de un mismo recurso.

Los demás productos tienen inventario independiente por unidad. Se comparte el componente de pollo a la brasa; esta versión no incluye un inventario por ingrediente ni descuenta automáticamente la gaseosa genérica de los combos de una marca concreta. Productos nuevos empiezan con cero existencias y un recurso propio. Asociar recetas nuevas a otro recurso requiere una migración revisada; no se infiere la receta a partir de futuros nombres editables.

## Saldo inicial y pedidos anteriores

No existía un conteo real. La instalación usa las estimaciones que mostraba el frontend: 200 pollos enteros como saldo común, cantidades particulares anteriores para productos conocidos y 50 unidades para los restantes productos existentes. **Estas cifras deben verificarse mediante un conteo físico.**

Se reservan las cantidades aún pendientes de las comandas activas anteriores. Lo que ya había salido de cocina se reconoce como asignación previa, sin descontarlo otra vez del saldo inicial. No se reescriben ni se anulan pedidos, pagos, comprobantes o mesas al instalar. Si las comandas pendientes exceden el saldo inicial, la instalación se revierte y se debe resolver el conteo antes de activarla.

## Reposición y ajustes

En Administración → Productos, cada tarjeta muestra stock y el botón **Ajustar existencias**. Se introduce una cantidad y un motivo:

- Positiva: reposición o corrección al alza.
- Negativa: retiro, merma o corrección a la baja.
- Para pollo compartido se expresa en pollos enteros y admite fracciones de 0.125; para los otros recursos, unidades enteras.
- Ajustar desde cualquier producto asociado al pollo modifica el mismo saldo compartido, no un saldo diferente para esa tarjeta.
- El saldo nunca puede quedar negativo. Para fijar un conteo físico de 30 cuando el sistema muestra 25, se añade +5.

Cada ajuste queda registrado con motivo, usuario, fecha y un identificador que evita duplicarlo si se reintenta. La disponibilidad manual del producto se conserva: reponer un producto deshabilitado no lo habilita automáticamente, y habilitar uno sin stock no crea existencias.

## Ediciones, anulaciones y devoluciones

- Antes de preparar: ampliar descuenta la diferencia; reducir devuelve lo retirado. Reintentar una confirmación no descuenta dos veces.
- Anular antes de preparar devuelve lo reservado exactamente una vez.
- Una vez iniciada la preparación o registrada una entrega, se conserva la asignación máxima por recurso. No se devuelve alimento preparado al inventario mediante edición, detención, anulación o devolución de dinero. Se trata como consumo o merma.
- Añadir productos tras una entrega descuenta solo el incremento que todavía no tenía asignación.
- No hay cambios en las autorizaciones de cocina, caja, incidencias ni cierre de mesas.

El servidor ejecuta el descuento en la misma transacción del pedido. Si falta stock, falla toda la operación y no queda una comanda parcialmente creada ni un descuento parcial. Las escrituras del inventario están restringidas; un cliente no puede modificarlo desde el HTML o llamar a la reposición administrativa.

## Actualización de pantallas

El catálogo y el carrito consultan `productos_catalogo`, una vista de solo lectura que calcula las existencias a partir del recurso y su receta. Los cambios se refrescan cada 20 segundos con la pestaña visible, al volver a la ventana y después de una operación local. El editor de salón también refresca el catálogo. La validación final del servidor se aplica aunque una pantalla aún muestre un saldo anterior.

La creación y edición administrativa conservan la tabla `productos`; las lecturas vuelven a la vista para obtener el stock vigente. Los filtros de administración consideran tanto la disponibilidad manual como las existencias. Los productos sin saldo aparecen agotados.

## Instalación, respaldo y recuperación

Migración: `migrations/inventario/20261116020000_inventario-compartido.sql`. Está instalada en el proyecto InsForge existente y registrada en `schema_migrations`.

Se exportó esquema, datos, funciones, secuencias y vistas antes de instalar en **`APF3/respaldo-antes-stock-20261116.sql`**, fuera de Git. El cupo de respaldo manual nativo estaba ocupado: se conservó el respaldo anterior y no se borró para crear otro.

El instalador `scripts/instalar-inventario.ps1` valida por defecto con rollback. Con `-Aplicar` instala exclusivamente esta migración. Bloquea las tablas pertinentes durante la instalación y compara pedidos, detalles, pagos y mesas antes y después; cualquier modificación revierte la operación. No volver a ejecutarlo sobre una instalación ya aplicada.

Para retirar exclusivamente esta funcionalidad se proporciona **`docs/revertir-inventario.sql`**, sin ejecutarlo automáticamente. Antes de usarlo, exportar también el estado actual y guardar `inventario_movimientos`, pues retirar las tablas elimina el registro de inventario posterior. Debe acompañarse de la recuperación del código anterior al stock: ese código es el que consulta `productos`, en vez de la vista nueva. Los pedidos y pagos posteriores pueden conservarse al retirar solo el inventario; restaurar el respaldo completo de la base, en cambio, reemplazaría los datos posteriores.

## Validación

- 13 pruebas de PostgreSQL para canales, fracciones compartidas, sobreventa, rollback, reintentos, ediciones, anulaciones, permisos, migración de pedidos pendientes y entregados, integración con cobro por tarjeta y retirada del inventario conservando pedidos y pagos.
- 3 pruebas de cálculo del límite compartido en carrito y editor.
- Tras integrar los cambios de caja desde `dev`, se verificaron 344 pruebas de servicios y PostgreSQL, incluida la combinación del pago con tarjeta y el descuento de stock sin duplicados.
- Seis recorridos de navegador con el backend SQL local, incluyendo agotamiento desde mesas y reposición administrativa.
- Lectura real del catálogo en PC y móvil y del control administrativo, sin generar ventas de prueba en InsForge.
- Las 65 comprobaciones anteriores de navegador se revisaron; los reintentos de checkout ahora reconocen la misma solicitud pendiente sin duplicar el descuento. Cambiar el contacto no permite generar otra compra en efectivo mientras la primera siga pendiente. Un bloqueo ya no se muestra como «Guardando...».

El inventario está activo en el backend compartido y su código se integra en `dev` junto con los cambios de caja. Actualizar el repositorio no requiere reinstalar la migración de inventario que ya está aplicada.
