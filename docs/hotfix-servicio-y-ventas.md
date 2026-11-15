# Hotfix: servicio directo y ventas

Base: `main` (`250b6f1`). Rama: `hotfix`.

## Cocina

Las categorías `bebidas` y `postres` son de servicio directo. El servidor guarda
`detalles_pedido.requiere_preparacion` al agregar cada producto; no depende del nombre
ni del filtro de la pantalla. Sus importes y cantidades siguen en la comanda y el cobro.

Los pedidos de solo servicio directo quedan `listo`, sin pasar por `en_preparacion`.
Los mixtos mantienen el flujo de cocina y solo muestran los platos en ese panel.
Esto también se aplica al historial, sin perder páginas por pedidos de solo bebidas.
La confirmación de comanda en Mesas usa un texto que sirve para ambos casos.

Al modificar una comanda lista, agregar o cambiar platos la devuelve a `pendiente`.
Cambiar únicamente bebidas o postres conserva los platos listos. Vaciar una comanda
lista la devuelve a `pendiente`. Se mantienen las restricciones de pago y los roles.

## Despliegue

Aplicar `migrations/20261115010000_servicio-directo.sql` mediante el gestor de
migraciones antes de publicar el frontend de esta rama. Requiere las migraciones
previas de Caja y Cocina. No editar las migraciones anteriores.
La migración completa debe ejecutarse en una transacción, como hace el gestor existente.

La migración clasifica los detalles existentes y marca como listas únicamente
las comandas activas sin platos de preparación. No registra pagos ni modifica
precios, totales, pedidos entregados o cancelados. Los cambios de estado mantienen
el historial y las notificaciones existentes.

Las pruebas usan PostgreSQL local mediante PGlite. No se modificó el backend compartido.
