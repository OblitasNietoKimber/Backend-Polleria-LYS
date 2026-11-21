# Pedidos online del cliente

Repositorio: `Backend-Polleria-LYS`. Rama: `feature/pedido-cliente`, creada desde `origin/dev` (`e86d015`). Se adapta el trabajo de pedidos del repositorio anterior a la autenticación, catálogo y esquema de este repositorio.

## Alcance

El cliente autenticado confirma pedidos de **delivery** o **recojo**, consulta sus pedidos y abre el detalle con importes, contacto y un historial de estados. Los precios se consultan en PostgreSQL dentro de una transacción. Delivery cuesta **S/ 6** y recojo **S/ 0**. Se conserva el nombre y el precio unitario vendidos aunque después cambie el catálogo.

Se mantiene React, Vite, SDK de InsForge, Auth y PostgreSQL. No se introduce Spring Boot ni MySQL. La integración utiliza `requireInsforge()` y la sesión de EPIC 1; el carrito conserva el servicio de productos de EPIC 2.

No se implementan las operaciones de mesas, cocina, caja ni dashboard. El método de pago es una preferencia del cliente: no acredita un cobro ni crea filas en `pagos`. La pasarela de tarjeta sigue siendo el prototipo existente. El usuario recibe una confirmación de recepción del pedido, sin afirmar que cocina ya empezó a prepararlo.

## Contratos conservados

No se cambia el UUID de `pedidos.id`, ni los campos `estado`, `destinatario` y `metodo_solicitado`. Se conserva exactamente la firma de la función existente:

```text
crear_pedido_cliente(
  solicitud_id uuid,
  tipo_entrega text,
  articulos jsonb,
  datos_entrega jsonb,
  metodo text
) -> uuid
```

`articulos` contiene `{id, qty}` por producto. Contacto: `{name, phone, address, reference}`. El servidor obtiene propietario y rol desde Auth/perfiles; el navegador no envía precios, total, propietario ni estado inicial. Los estados continúan siendo `pendiente`, `en_preparacion`, `listo`, `entregado` y `cancelado`; no se añaden estados nuevos para otras épicas. El paso visual «En camino» preexistente no implica que ya exista esa transición en PostgreSQL.

La función admite 1–100 productos distintos y cantidades enteras de 1–100. Valida nombre de 2–120 caracteres, teléfono peruano de 9 dígitos empezando por 9, dirección de delivery de 5–250 caracteres y referencia de hasta 500. Para recojo la dirección almacenada se normaliza a vacía. Métodos: efectivo, tarjeta, yape y plin. Rechaza productos inexistentes o no disponibles y revierte encabezado, detalles e historial si cualquier línea falla.

La solicitud usa un UUID persistido antes de enviarla. El servidor serializa su uso con un bloqueo transaccional y compara una huella del contenido normalizado: mismo propietario y contenido devuelven el pedido ya guardado; cambiar propietario, contacto, productos, cantidades, tipo o método con el mismo UUID produce error. Cambiar precios o nombres del catálogo no cambia un pedido confirmado. Las líneas se procesan ordenadas por ID para adquirir los bloqueos de productos en orden estable.

El carrito conserva solicitud y contenido en `lys-pending-order`, también al recargar. La firma incorpora la cuenta actual y no incluye los precios del navegador. Cambiar el contenido genera otra solicitud. La aplicación consulta el pedido guardado antes de vaciar el carrito. Si falla la RPC o la lectura posterior, conserva carrito y solicitud para reintentar. El bloqueo por catálogo no disponible de EPIC 2 sigue activo; ante una respuesta perdida y un producto después agotado, el cliente puede consultar «Mis pedidos» para localizar el pedido que ya se hubiera confirmado. Si el navegador bloquea localStorage, el reintento se conserva únicamente en memoria hasta recargar.

## Lecturas y presentación

| Consulta | Comportamiento |
| --- | --- |
| `getOrders({page})` | 20 pedidos, propietario actual, orden por fecha y UUID descendentes |
| `getOrderById(id)` | UUID y propietario; ausencia devuelve `null` |
| `getOrderState(id)` | Solo `estado`; comprobación del propietario |
| `getOrderHistory(id,{before})` | Hasta 50 eventos por página, orden descendente por ID y cursor para anteriores |
| `createOrder(payload)` | RPC compatible y lectura posterior; devuelve el pedido confirmado al contexto |

«Mis pedidos» permite avanzar y retroceder, diferencia carga/error/vacío y ofrece reintento. Una página completa habilita «Siguiente»; si hay exactamente un múltiplo de veinte registros, la página siguiente puede estar vacía y permite volver.

El detalle permite reintentar su consulta. El historial muestra primero los eventos más recientes, permite consultar eventos anteriores y actualizar la página reciente. Su actualización es manual; los badges y el stepper consultan únicamente el estado cada 15 segundos y pausan las consultas con la pestaña oculta. No se implementa Realtime.

Las tarjetas distribuyen código, producto, estado, total y navegación sin superponerlos. Los UUID y nombres largos pueden ocupar varias líneas; en celulares las secciones se apilan. Se conserva el identificador real, sin sustituirlo por un código corto que pudiera confundirse con otro pedido. La confirmación incluye «Ver mi pedido». Los pedidos cancelados muestran un mensaje específico en lugar del avance normal.

## Migraciones

Se conservan intactas las ocho migraciones anteriores. Se utiliza el ejecutor existente `scripts/apply-migrations.mjs`, su directorio `insforge/migrations/` y su registro de checksum; no se añade un segundo sistema de migración.

| Archivo | Cambio |
| --- | --- |
| `009_importes_pedidos.sql` | Subtotal, huella, nombre vendido, índice por cliente/fecha y triggers para mantener importes |
| `010_historial_estados_pedidos.sql` | Auditoría de estado inicial y cambios reales, actor/fecha, RLS y solo lectura para el cliente |
| `011_confirmar_pedidos_cliente.sql` | Validación, idempotencia por contenido y sustitución compatible de la RPC existente |

El subtotal inicial de pedidos anteriores se obtiene de `total-envio` para conservar los importes registrados. Los nombres anteriores se completan con el catálogo disponible al migrar: no se puede recuperar un nombre histórico que nunca se guardó. El historial anterior se representa mediante una instantánea con `es_reconstruido=true`, fecha de incorporación y actor nulo; no se inventan cambios ni fechas anteriores.

Los nuevos detalles actualizan subtotal y total mediante triggers. Insertar, cambiar cantidad/precio o retirar una línea desde una futura RPC autorizada de salón mantiene los importes; cambiar el catálogo no modifica los detalles ya vendidos. Los roles de ejecución no reciben escritura directa sobre pedidos ni detalles. Las épicas siguientes deben mantener RPCs que validen sus propios roles, transiciones, pagos y cierre de mesas; este cambio no adelanta esos endpoints.

RLS conserva la visibilidad actual de pedidos: propietario o personal autorizado. Detalles e historial dependen de la visibilidad del pedido. El visitante no puede leerlos. Los clientes no pueden escribir importes, propietario, estado, detalles ni auditoría directamente. Los triggers son `SECURITY DEFINER`, tienen `search_path` fijado y referencias explícitas a tablas. El actor del historial se registra en el servidor y no se solicita como parte de las lecturas de la interfaz.

## Entornos y validación

Proyecto principal: **Backend-Polleria-LYS**, ID `7783e71f-8c16-4fd9-a2e6-24869bf1ec9f`, URL `https://b9zz47j5.us-east.insforge.app`.

Se creó la rama aislada de InsForge `pedido-cliente`, ID `4fe91ede-fadd-4812-bd30-71916515a08b`, URL `https://b9zz47j5-x2w.us-east.insforge.app`, modo **schema-only**. Las migraciones 009–011 se aplicaron allí con el ejecutor existente. Como schema-only copia DDL sin filas de negocio ni del registro de migraciones, se reconstruyó en esa rama el registro de las ocho migraciones base y se cargaron únicamente roles, estados y un producto sintético de prueba. No se copiaron cuentas ni pedidos de clientes del proyecto principal.

La CLI local quedó vinculada a esa rama. Comprobar `npx -y @insforge/cli current --json` antes de ejecutar cambios de infraestructura. El frontend mantiene la validación estricta de URL de EPIC 2; no se relajó para aceptar otros proyectos. Las pruebas de navegador usan la URL esperada del proyecto con respuestas interceptadas y una clave pública ficticia. Las comprobaciones SDK contra la rama utilizan su URL y clave pública por separado, sin cambiar el frontend para usar credenciales administrativas.

Resultados del 16 de octubre de 2026:

- **82 pruebas Vitest aprobadas**: 28 existentes y 54 nuevas. Incluyen las once migraciones en PostgreSQL embebido con PGlite, precios, envío, snapshots, backfill, idempotencia, rechazo de solicitudes distintas, rollback, actores/fechas, permisos y aislamiento entre clientes sin filtros del servicio; también contratos SDK y persistencia de solicitudes.
- **32 pruebas Playwright aprobadas**: 18 existentes de autenticación/catálogo y 14 de pedidos. Incluyen confirmación de delivery/recojo, reintento tras fallo de RPC o lectura y recarga, cambio de contacto, paginación, cancelación, pedido ajeno y tarjetas a 320, 390, 768, 876 y 1280 px. Se midieron contención, ausencia de solapamiento, texto visible y ausencia de desbordamiento. Captura a 876 px revisada visualmente.
- **Build aprobado**. Persisten los avisos preexistentes de tamaño del paquete y `crypto` del SDK.
- ESLint de los archivos nuevos/modificados aprobado; para `CartContext.jsx` se comprobó con `react-refresh/only-export-components` desactivada porque el módulo ya exporta componente y hook en la arquitectura existente. No se afirma que el lint global del proyecto esté limpio.
- En la rama remota, `authenticated` no tiene UPDATE de pedidos/subtotal ni INSERT del historial. Las tres migraciones nuevas figuran en su registro.
- La API real de la rama rechazó lecturas anónimas de pedidos, detalles e historial y ejecución anónima de la RPC (`42501`). Estas comprobaciones no sustituyen una compra con una sesión real verificada.

Para repetir las comprobaciones locales desde `Front-Polleria-LYS-main`:

```bash
npm ci
npm test
npm run build
npx playwright install chromium
npm run test:e2e -- --workers=2
```

Si se usa un Chromium instalado, indicar `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`. Playwright abre un servidor propio con credenciales ficticias; no reutiliza otro servidor ni `.env.local`. En este entorno se ejecutó con un Chromium temporal, sin cambiar dependencias ni el lockfile del proyecto.

No se ejecutó la prueba de seguridad antigua que inserta usuarios directamente en `auth.users`. No se desactivó la verificación de correo. **Queda pendiente una compra autenticada con una cuenta real verificada** y su consulta en la API real; las pruebas del navegador simulan Auth/DB y las pruebas locales de RLS utilizan usuarios de prueba.

## Revisión antes de publicar

Los cambios y commits están preparados **localmente**. No se hizo push, no se abrió PR y las migraciones nuevas **no se aplicaron al proyecto principal**. Primero se revisan los commits. Tras aprobación, se publica `feature/pedido-cliente` y se abre PR a `dev`; las migraciones del principal se coordinan por separado para que no quede desplegado código que requiera columnas aún ausentes.

Las credenciales de administración permanecen en la configuración local ignorada. No deben aparecer en código, commits ni variables `VITE_`.
