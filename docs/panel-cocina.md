# Panel de cocina y seguimiento

Trabajo local en `feature/panel-cocina`, creado desde `dev` (`ef23045`) del repositorio **Backend-Polleria-LYS**. Se revisaron las ramas integradas de autenticación, catálogo, pedidos del cliente, meseras y caja. Esta implementación usa el esquema del nuevo backend; no reutiliza los contratos del proyecto anterior.

## Configuración general

- Proyecto: `Backend-Polleria-LYS`, ID `7783e71f-8c16-4fd9-a2e6-24869bf1ec9f`.
- Backend principal: `https://b9zz47j5.us-east.insforge.app`.
- MCP registrado con la nueva credencial administrativa; se llamó a `fetch-docs` para `instructions`, `db-sdk` y `real-time`, y se comprobó que la clave permite consultar el esquema de `pedidos`.
- El instalador solicitado falló al buscar un `codex.cmd` inexistente en Windows. Se completó el registro con la CLI `codex.exe` disponible.
- El repositorio está vinculado mediante InsForge CLI. `.env.local` contiene exclusivamente la URL y la clave pública del proyecto correcto. No se imprimen ni se versionan las claves.
- Se mantienen las validaciones existentes que rechazan el backend anterior. No se cambia la configuración de Auth ni se crean usuarios reales para las pruebas.

## Pedidos de cocina

El panel consulta `pedidos`, `detalles_pedido`, `mesas` e `historial_estados_pedido` desde PostgreSQL. Muestra nombres vendidos, cantidades, observaciones (`notas`), mesa, tipo de atención y la última auditoría. No consulta precios ni nombres del catálogo local para reconstruir una comanda.

| Columna de cocina | Estado persistido |
| --- | --- |
| Nuevos pedidos | `pendiente` |
| Preparando | `en_preparacion` |
| Listos | `listo` |

La RPC `cambiar_estado_cocina` admite únicamente Nuevo → En preparación → Listo, comprueba el rol, bloquea la fila y compara el estado observado por la pantalla. Si otra persona ya cambió el pedido, devuelve un conflicto y el panel vuelve a consultar. Los botones se bloquean durante la operación, con protección adicional frente a dos clics antes del siguiente render.

El trigger de validación también comprueba las transiciones ante un UPDATE administrativo con contexto de usuario. No se conceden escrituras directas sobre el pedido a cocina. La auditoría reutiliza el trigger existente: autor, estado anterior, estado nuevo y fecha del servidor se guardan en la misma transacción. No se inventan fechas de preparación para registros históricos reconstruidos.

Los filtros usan `recojo`, el valor real del servidor. El historial muestra pedidos listos y entregados, con páginas de cincuenta registros, responsable y fecha. Los registros sin fecha confirmada se presentan en su propia sección.

## Compatibilidad con meseras y caja

- Se conserva el envío de comanda de meseras: esos pedidos ya pasan a `en_preparacion` al enviarse.
- Se retiran las lecturas y escrituras de `lys_pedidos` de la comanda. Los borradores locales de una comanda aún no enviada conservan su idempotencia y solo se eliminan después de confirmar el servidor.
- El detalle de mesa abierto usa la versión actual de los datos del servidor. Los errores de consulta se muestran y una respuesta vacía no conserva mesas antiguas como si siguieran activas.
- Cocina no entrega pedidos ni libera mesas. Caja continúa registrando el pago, marcando la atención de salón como entregada y liberando la mesa en una operación atómica, incluso si el pedido aún no fue marcado Listo.
- Se mantienen los bloqueos de importes y productos cobrados. La suscripción de Caja no interrumpe un cobro en curso ni un reintento con respuesta perdida y no duplica su consulta inicial.
- El registro local de actividades y las reservas del prototipo de salón conservan su alcance anterior; no se usan para decidir estados de cocina.

## Actualización automática

Se publican eventos de servidor en los canales privados `lys:staff` y `lys:client:<UUID del usuario>`. El payload contiene solo el UUID del pedido. Cada pantalla vuelve a consultar las tablas con RLS; un evento no puede cambiar el estado ni aportar importes o datos personales.

Los canales tienen políticas permisivas de acceso por rol/propietario y políticas restrictivas adicionales que siguen protegiéndolos aunque se agregue otra política amplia. El visitante no puede suscribirse y el navegador no puede publicar eventos falsos de `lys:*`.

Los componentes comparten una suscripción y una sonda por canal. La sonda consulta únicamente el número de pedidos visibles y la última fecha `actualizado_en`, con `limit(1)`. No descarga las comandas si no hay cambios. Un cambio de detalles actualiza esa fecha sin duplicar el historial de estados. Se recuperan cambios al volver a la pestaña, recuperar red o reconectar WebSocket; las consultas periódicas se suspenden con la pestaña oculta.

Las consultas de cada recurso se serializan y se repiten si llega un evento durante una carga. Al cambiar de pedido o de página se descartan respuestas antiguas. Cocina consulta cada cinco segundos como respaldo; el cliente utiliza diez segundos. Caja conserva su sonda propia.

## Migraciones y rama de prueba

Las migraciones nuevas son:

1. `migrations/20261016220000_panel-cocina.sql`: permisos de lectura, validación, RPC e índice.
2. `migrations/20261016220100_seguimiento-pedidos.sql`: canales, RLS y publicación transaccional.

No se modificó ninguna migración anterior. Se aplicaron y verificaron exclusivamente en la rama aislada de InsForge **panel-cocina**, ID `9ed44f2c-7886-46d2-af36-15b79996945d`, URL `https://b9zz47j5-cd4.us-east.insforge.app`. La rama se creó como copia completa del proyecto para comprobar la compatibilidad con sus migraciones previas.

**Pendiente de aprobación:** publicar la rama Git y aplicar estos cambios al backend principal. La aplicación local conserva la URL principal; para probar la rama con el SDK se usa el contexto aislado y su clave pública, sin modificar las constantes de producción del frontend.

El ejecutor permite seleccionar las migraciones nuevas sin repetir Caja ni las anteriores:

```bash
# Con INSFORGE_BASE_URL e INSFORGE_API_KEY del entorno administrativo autorizado:
node scripts/apply-migrations.mjs --application --from 20261016220000
```

Registra versión y SHA-256 normalizado para Windows, rechaza modificaciones posteriores y usa un bloqueo para evitar dos aplicaciones simultáneas. Sin opciones conserva las migraciones base de `insforge/migrations/`.

## Verificación

- 192 pruebas unitarias aprobadas. Las pruebas nuevas ejecutan PostgreSQL con PGlite y cubren permisos, transiciones inválidas/nulas, concurrencia, auditoría, compatibilidad con cobros, RLS de canales, lectura paginada, sonda eficiente y ejecutor de migraciones.
- 50 pruebas de navegador: cocina y cliente en sesiones separadas, conflictos, recojo, historial móvil, recuperación sin WebSocket y regresiones de Auth, catálogo, pedidos y Caja. Las APIs y WebSockets reales se interceptan; no se envían correos ni se registran pedidos reales.
- Compilación de producción y lint de los archivos modificados. El lint global conserva tres errores previos en MascotCarousel, OrderDeliveryInfo y CartContext.
- En la rama real se comprobaron las funciones, triggers, políticas y el registro de las dos migraciones. La prueba `test:cocina-read` verificó que el visitante no puede leer pedidos, ejecutar la RPC ni suscribirse a canales privados. No crea usuarios ni pedidos.
- La prueba manual con cuentas reales de cocina y cliente requiere iniciar sesión en el entorno donde se apliquen las migraciones autorizadas. No se han comprobado sesiones reales de personal con contraseñas de usuarios.

## Commits previstos para revisión

1. `feat(permisos): Permitir consultar mesas y comandas desde cocina`
2. `feat(pedidos): Validar las transiciones de estado en el servidor`
3. `feat(cocina): Actualizar cocina con control de concurrencia`
4. `feat(realtime): Configurar canales privados para los pedidos`
5. `feat(realtime): Publicar cambios de pedidos desde PostgreSQL`
6. `feat(realtime): Compartir suscripciones y recuperar la conexión`
7. `feat(pedidos): Serializar consultas y descartar respuestas antiguas`
8. `feat(mesas): Consultar el estado real de cocina en las mesas`
9. `feat(mesas): Actualizar las mesas sin eventos de pedidos locales`
10. `feat(cocina): Conectar el panel de cocina con InsForge`
11. `feat(cocina): Mostrar errores y bloquear cambios duplicados`
12. `feat(cocina): Corregir los filtros de pedidos para recojo`
13. `feat(cocina): Paginar el historial y mostrar su auditoría`
14. `feat(pedidos): Actualizar la lista de pedidos del cliente`
15. `feat(seguimiento): Sincronizar el seguimiento y el historial del cliente`
16. `feat(caja): Recibir cambios en caja sin interrumpir cobros`
17. `feat(insforge): Preparar las migraciones y verificar el nuevo backend`
18. `feat(docs): Documentar la configuración y validación de cocina`
