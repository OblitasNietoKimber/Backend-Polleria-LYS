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

Aplicar `migrations/20261115030000_servicio-directo-compatible.sql` mediante el gestor de
migraciones antes de publicar el frontend de esta rama. Requiere las migraciones
previas de Caja y Cocina. No editar las migraciones anteriores.
La migración completa debe ejecutarse en una transacción, como hace el gestor existente.

La migración clasifica los detalles existentes y marca como listas únicamente
las comandas activas sin platos de preparación. No registra pagos ni modifica
precios, totales, pedidos entregados o cancelados. Los cambios de estado mantienen
el historial y las notificaciones existentes.

Las pruebas usan PostgreSQL local mediante PGlite. No se modificó el backend compartido.

## Ventas y efectivo

Caja separa `Ventas del día` de `Efectivo cobrado del día`. Ambos usan la fecha
del cobro en `America/Lima`, también cuando el navegador usa otra zona horaria.
El día se renueva en la consulta periódica aunque no haya nuevos pedidos.

- Salón, delivery y recojo suman a ventas solamente con un pago confirmado.
- Efectivo suma al indicador de efectivo por el importe neto, sin incluir el vuelto.
- Tarjeta, Yape y Plin registrados suman a ventas, sin sumarse al efectivo.
- Los pedidos pendientes siguen en `Por cobrar`.

Este indicador no representa un arqueo ni un saldo de turno: no incluye fondo
inicial, retiros ni gastos. La aplicación no tiene gestión de esos movimientos.
El dashboard conserva sus consultas SQL, filtros y actualización existentes;
las pruebas comprueban delivery con los cuatro métodos y pago con vuelto.
El checkout y su simulación de tarjeta no cambian en este hotfix.

## Validación local

- 250 pruebas unitarias y de PostgreSQL local correctas (`npm test`).
- Compilación correcta (`npm run build`).
- Lint correcto para CajaPage, cocinaService y cajaSummary.
- Se añadieron pruebas de navegador de comandas mixtas, servicio directo,
  separación del efectivo y cambio de día en Perú.
- No pudieron ejecutarse las 26 pruebas de navegador de Caja, Cocina y Dashboard:
  Chromium no inicia en este entorno (`socket() failed: Operation not permitted`).
  La verificación visual y de navegador queda pendiente en un entorno habilitado.

Subir la rama no aplica la migración ni publica el frontend. No se ejecutaron
cobros ni se alteraron datos en el backend compartido.

## Corrección de instalación con pedidos cobrados

La migración inicial `20261115010000` intentaba clasificar los detalles históricos
con los triggers de protección de cobros activos y fallaba cuando ya había pagos.
No es necesario borrar pedidos, detalles, pagos ni historial.

El reemplazo `20261115020000_servicio-directo-seguro.sql` es autosuficiente y se puede
copiar completo al editor SQL. Funciona con la columna ausente o creada en un intento
anterior, y admite volver a ejecutarlo. No modifica el archivo de la versión inicial
ni sus checksums. El ejecutor omite la versión inicial si aún está pendiente y aplica
el reemplazo, conservando la validación de versiones que ya estaban registradas.

La clasificación se hace bajo bloqueo de escritura y dentro de un único bloque
atómico. Solo durante esa actualización de metadatos se suspenden los triggers del
detalle que impedirían clasificar una venta cobrada, recalcularían importes o emitirían
notificaciones históricas. Se restauran antes de terminar. Si hay un error, PostgreSQL
revierte el bloque completo y restaura los triggers. No se cambian los datos de pagos,
comprobantes, productos vendidos, cantidades o importes.

Validación de la corrección: 251 pruebas correctas. La nueva prueba reproduce el
fallo original con ventas de salón y delivery ya cobradas, verifica el rollback
ante un fallo forzado, el reintento con la columna ya creada, la conservación de
pagos y comprobantes y el bloqueo de cambios a productos cobrados después de instalar.

## Instalaciones sin triggers de notificación

Usar ahora `20261115030000_servicio-directo-compatible.sql`, completo. La versión
anterior suponía que existía `detalles_cocina_notificar`; algunas bases no lo tienen.
La versión compatible consulta `pg_trigger` para suspender solo los triggers existentes
y restaura sus modos originales, incluidos DISABLE, ENABLE REPLICA y ENABLE ALWAYS.
No depende de los triggers opcionales de notificación para completar la instalación.
Las dos versiones anteriores se conservan sin cambios para respetar sus checksums.
El ejecutor usa la versión compatible en lugar de las anteriores si están pendientes.

Validación de compatibilidad: 254 pruebas correctas. Se reproduce también el fallo
de trigger inexistente y se prueba con notificaciones completas, notificación de
detalles ausente, ambos triggers de notificación ausentes y modo de réplica.
