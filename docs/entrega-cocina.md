# Entrega de cocina, cobro y cierre de atención

Implementación en `feature/panel-cocina`, actualizada desde `dev` (`afa00ec`).

## Comportamiento

El panel conserva las columnas Nuevos pedidos → Preparando → Listos. Las tarjetas listas muestran **Entregar**. La entrega se persiste en PostgreSQL; después de confirmarse, la tarjeta desaparece del panel activo y queda en el historial incluso al recargar o entrar desde otra sesión.

| Atención | Acción de cocina | Pago | Cierre |
| --- | --- | --- | --- |
| Salón | Entrega a mesera y retira la tarjeta | Puede cobrarse antes o después | Se cierra y libera automáticamente la mesa cuando está pagada y no quedan platos por entregar |
| Para llevar | Entrega al cliente y retira la tarjeta | Debe estar confirmado en caja | Pasa a Entregado |
| Delivery | Entrega al repartidor y retira la tarjeta | Pagado, o efectivo contra entrega | Pasa a En camino; caja/administración confirma después la entrega al cliente, con pago confirmado |

Elegir tarjeta, Yape o Plin no confirma un pago. La entrega de cocina tampoco registra cobros. La RPC de caja conserva validación de importe, vuelto, comprobante e idempotencia. El comprobante conserva su información financiera original; caja consulta el estado operativo actual del pedido por separado.

La mesa permanece ocupada después de entregar los platos si sigue pendiente el cobro. También permanece ocupada después de un cobro anticipado si aún hay platos por preparar o entregar. La liberación manual rechaza las atenciones pendientes de pago o entrega. Los pedidos cobrados no admiten cambios de productos o importes; sí permiten completar preparación y entrega.

Si la mesera amplía una comanda no cobrada después de una entrega, solo las cantidades adicionales vuelven a cocina. No se vuelven a preparar las cantidades ya entregadas. Se conserva cada entrega, con productos, cantidades, fecha del servidor y responsable. No se permite retirar de la cuenta cantidades físicamente entregadas. Editar bebidas o postres no reabre los platos ya entregados; esos productos mantienen su servicio directo.

## Persistencia y concurrencia

`pedidos.cocina_entregado_en` y `cocina_entregado_por` separan la salida de cocina del estado global del pedido. La tabla `entregas_cocina` registra cada entrega y sus cantidades; únicamente cocina y administración pueden leerla mediante RLS, y el navegador no tiene permisos de escritura directa.

`entregar_pedido_cocina` comprueba el rol, bloquea mesa → pedido y compara el sello `actualizado_en` observado por la tarjeta. Una modificación o un cobro posterior al sello obliga a actualizar antes de entregar. Reintentar una versión ya entregada devuelve el mismo resultado sin duplicar la entrega ni liberar una mesa reutilizada. Se conserva la protección del frontend frente a clics duplicados y se recarga el panel tanto en éxito como en error.

Los cambios utilizan las notificaciones existentes y la sonda de pedidos, con el UUID como único dato del evento. La salida de delivery aparece como En camino en el seguimiento del cliente. El botón **Confirmar entrega al cliente** está disponible en caja para delivery en camino y cobrado; verifica nuevamente esas condiciones en el servidor.

El historial pagina en el servidor y conserva las entregas anteriores de una comanda ampliada. Los pedidos antiguos cerrados se muestran como registros anteriores, sin inventar una fecha de entrega física. Los pedidos todavía listos requieren una entrega explícita; la migración no los oculta ni marca como entregados automáticamente. Los registros de más de treinta días siguen visibles en su sección.

## Instalación

Instalada en el backend `b9zz47j5.us-east.insforge.app` el 15 de noviembre de 2026. La versión `20261115180000_entrega-cocina.sql` quedó registrada en `public.schema_migrations` con checksum `5a55f07cd302b9b728ebd872da73b4b9c7d9915aaa2f97d3f992f6f79dc04d5b`. La instalación se validó primero con rollback y después se ejecutó de forma atómica, comprobando dentro de la transacción que pedidos, pagos, detalles y mesas existentes no cambiaban. Se notificó la recarga del esquema de PostgREST y la consulta real con `entregas_cocina(items)` respondió HTTP 200.

Los datos anteriores conservan sus estados: no se inventaron entregas históricas. La protección por filas y los permisos de la tabla de entregas están habilitados. El código local conserva el modo compatible para otros entornos todavía sin actualizar. No se hizo commit, push ni despliegue del frontend.

El frontend admite temporalmente el esquema anterior: si faltan la relación de entregas o su columna, carga los pedidos activos sin esos campos y mantiene Comenzar y Marcar listo. Entregar queda deshabilitado con un aviso; no se simulan entregas ni pagos. El historial puede consultar los pedidos entregados anteriores si todavía no existe la RPC nueva, sin atribuirles una fecha de entrega física. Los errores de permisos o conexión siguen mostrándose. Esta compatibilidad no aplica migraciones ni permite probar la persistencia nueva contra un servidor sin actualizar.

Migración: `migrations/20261115180000_entrega-cocina.sql`. Requiere las migraciones existentes de Caja, Cocina, Seguimiento y Servicio directo compatible. No modifica migraciones previas ni registra pagos o entregas históricas.

Para instalarla en otro entorno autorizado, aplicar la migración antes de desplegar el frontend:

```bash
node scripts/apply-migrations.mjs --application --from 20261115180000
```

El ejecutor utiliza las credenciales administrativas del entorno y registra el checksum de la migración dentro de su transacción. El SQL completo también está envuelto en un bloque atómico para su uso en el editor SQL. No se debe ejecutar por segunda vez manualmente: el ejecutor se encarga de omitir versiones ya aplicadas.

## Validación local

297 pruebas locales aprobadas, compilación de producción correcta y lint sin errores en los archivos revisados.

Las pruebas de PostgreSQL con PGlite y los servicios cubren pago antes/después de la entrega, permanencia de la mesa ocupada, cobros idempotentes, bloqueo de liberación prematura, cantidades añadidas, historial por entrega, conflictos de versión, permisos, rollback, retiro de recojo pagado y delivery contra entrega. Se conservan las regresiones de ventas e importes.

Las 27 pruebas de navegador de cocina y caja pasaron con las APIs interceptadas: retiro persistente de tarjetas, entrega móvil, errores, seguimiento En camino, confirmación de delivery desde caja, comprobantes y resumen de ventas. La lectura independiente de la API real también pasó y reconoce la relación nueva. Las pruebas no crearon pedidos, cobros ni entregas reales en el backend principal.
