# Mesas y pedidos de salón (EPIC 4)

Repositorio: `Backend-Polleria-LYS`. Rama: `feature/pedido-meseras`.
Se implementa la gestión integral de mesas y pedidos de salón para el rol **Mesera** y **Administrador**, conectando el frontend a **InsForge (PostgreSQL + Auth + RPCs)** y garantizando la integridad transaccional del negocio.

---

## 1. Mapeo de Actividades Jira (SCRUM-276 a SCRUM-283)

| Ticket | Actividad | Solución Implementada |
| :--- | :--- | :--- |
| **SCRUM-277** | Consultar el estado de las mesas desde PostgreSQL | Función de servidor `obtener_mesas_con_pedidos()` que devuelve las 16 mesas sincronizadas con sus pedidos activos, comensales, importes calculados por triggers e historial de consumo. |
| **SCRUM-278** | Función de servidor para abrir un pedido y ocupar su mesa | RPC `abrir_pedido_salon(solicitud_id, mesa_id, comensales, notas, articulos)` con `SECURITY DEFINER`, validación de rol mesera/admin y actualización del estado de la mesa a `ocupada`. |
| **SCRUM-282** | Impedir dos pedidos activos simultáneos en una misma mesa | Índice único parcial `pedidos_salon_mesa_activa_idx` en PostgreSQL (`WHERE tipo = 'salon' AND estado NOT IN ('entregado', 'cancelado')`) y bloqueo con `FOR UPDATE` en la RPC. |
| **SCRUM-279** | Permitir agregar productos y observaciones a un pedido abierto | RPC `agregar_o_modificar_detalles_salon(pedido_id, articulos, notas)` que reemplaza/actualiza comanda y observaciones, activando el trigger `recalcular_subtotal_pedido` para actualizar importes. |
| **SCRUM-280** | Registrar el envío del pedido a cocina | RPC `enviar_pedido_cocina(pedido_id)` que avanza el pedido de `pendiente` a `en_preparacion` y registra la transición en `historial_estados_pedido` con el usuario que lo ejecutó y marca temporal. |
| **SCRUM-281** | Registrar la solicitud de cuenta para caja | Columna `cuenta_solicitada` en `public.pedidos` y RPC `solicitar_cuenta_salon(pedido_id)` para notificar a Caja el pedido pendiente de cobro. |
| **SCRUM-283** | Sustituir `lys_mesas` y escrituras directas a `lys_pedidos` | `mesaService.js` refactorizado para interactuar con PostgreSQL mediante el SDK y RPCs, manteniendo sincronización en memoria y eventos locales para los módulos de cocina y caja. |
| **SCRUM-276** | Flujo completo de mesera: abrir pedido y enviarlo a cocina | Flujo integrado en `NuevoPedidoPage.jsx`, `MesasPage.jsx` y `MesaDetalleModal.jsx`. |

---

## 2. Contratos y Funciones RPC de PostgreSQL

Todas las funciones están protegidas con `SECURITY DEFINER`, `search_path = ''` y restringen la ejecución a usuarios autenticados con rol `mesera` o `admin`:

### `abrir_pedido_salon`
```text
abrir_pedido_salon(
  solicitud_id uuid,
  p_mesa_id bigint,
  p_comensales integer,
  p_notas text,
  p_articulos jsonb DEFAULT '[]'::jsonb
) -> uuid
```
- Valida rol `mesera` o `admin`.
- Adquiere bloqueo de fila en `public.mesas`.
- Rechaza si la mesa ya tiene un pedido activo (`estado NOT IN ('entregado', 'cancelado')`).
- Inserta el pedido con `tipo = 'salon'`, `estado = 'pendiente'`, `comensales` y `notas`.
- Marca la mesa como `ocupada`.
- Si se pasan artículos, los inserta en `detalles_pedido` y el trigger `detalle_importes` calcula el subtotal y total automáticamente.

### `agregar_o_modificar_detalles_salon`
```text
agregar_o_modificar_detalles_salon(
  p_pedido_id uuid,
  p_articulos jsonb,
  p_notas text DEFAULT NULL
) -> boolean
```
- Valida rol y comprueba que el pedido esté activo.
- Actualiza observaciones y comanda. El trigger recalcula montos al instante.

### `enviar_pedido_cocina`
```text
enviar_pedido_cocina(
  p_pedido_id uuid
) -> boolean
```
- Comprueba que el pedido tenga al menos 1 producto.
- Cambia `estado = 'en_preparacion'`.
- El trigger `pedido_historial` registra en `historial_estados_pedido`: `estado_anterior='pendiente'`, `estado='en_preparacion'`, `cambiado_por=auth.uid()`.

### `solicitar_cuenta_salon`
```text
solicitar_cuenta_salon(
  p_pedido_id uuid
) -> boolean
```
- Marca `cuenta_solicitada = true` en el pedido.

### `liberar_mesa_salon`
```text
liberar_mesa_salon(
  p_mesa_id bigint
) -> boolean
```
- Cambia el estado de la mesa a `libre`.

### `obtener_mesas_con_pedidos`
```text
obtener_mesas_con_pedidos() -> jsonb
```
- Retorna las 16 mesas con datos de su pedido activo (id, estado, cuenta_solicitada, comensales, importes y productos).

---

## 3. Pruebas y Validación

1. **Pruebas de Base de Datos PGlite**:
   - `tests/mesas-database.test.js`: 8 pruebas cubren apertura de pedidos, rechazo a roles no autorizados, exclusividad de mesas (SCRUM-282), modificación de comanda, envío a cocina, auditoría en historial y liberación de mesas.
2. **Pruebas Unitarias del Servicio**:
   - `tests/mesas-service.test.js`: 6 pruebas validan el mapeo y los llamados a cada RPC del cliente.
3. **Suite Completa**:
   - 96 pruebas Vitest aprobadas (0 fallos).
4. **Compilación Frontend**:
   - `npm run build` ejecutado exitosamente con Vite.
