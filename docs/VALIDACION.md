# Validación de configuración y épica 1

Base: `dev`, commit `2c3cdc26ef7af76ec9cc9a2a4c1132cd43657795`.

## Correspondencia con la imagen

| Tarea | Entrega |
| --- | --- |
| SCRUM-243/244/245 | SDK, cliente compartido, entorno, exclusión de credenciales |
| SCRUM-246/247 | Migraciones PostgreSQL de perfiles/roles, catálogo, mesas, pedidos/detalles/estados/pagos; DDL MySQL original ausente |
| SCRUM-248 | 4 categorías, 17 productos y 16 mesas; sin pedidos ni usuarios de prueba permanentes |
| SCRUM-249/258 | RLS, grants de columnas, rol asignado por servidor y rutas de cinco roles |
| SCRUM-251/252 | Auth real e historial/detalle de pedidos propios |
| SCRUM-253 | Datos y preferencias en perfil vinculado al ID de Auth |
| SCRUM-254 | Google/PKCE/callback; prueba con proveedor real pendiente |
| SCRUM-255 | Compatibilidad Facebook evaluada; configuración/integración requiere tarea independiente |
| SCRUM-256/257 | Correo, intercambio código-token, reset; eliminado código demo; entrega real de correo pendiente |
| SCRUM-259 | Pruebas Playwright reproducibles |

## Resultado

- Compilación Vite: correcta. Advertencias sobre tamaño de bundle e importación dinámica de crypto del SDK.
- Navegador: 11 escenarios Playwright correctos con respuestas controladas de Auth/DB.
- Backend real: 9 comprobaciones correctas: aislamiento de perfiles/pedidos/detalles, bloqueo de cambio de rol y metadata, precios del servidor, idempotencia, bloqueo de totales/pagos falsos, lectura por personal y catálogo público. Usuarios y pedidos temporales eliminados al terminar.
- Lint de Auth, rutas y consulta de pedidos: correcto. CartContext conserva la incidencia previa sobre export del hook y fast refresh. El lint general del proyecto ya tenía 15 errores y 1 advertencia en `dev`. Permanecen incidencias de código preexistente en MascotCarousel, OrderDeliveryInfo, CartContext (export de hook/fast refresh), usePedidosCocina, useTiempoTranscurrido, CajaPage y cocinaService.
- La verificación de Google y recuperación en Playwright prueba la integración de la interfaz, no entrega real de correo ni consentimiento de Google.

## Límites de esta entrega

No hay DDL MySQL adjunto que permita validar una conversión exacta. No se crearon cuentas demo permanentes. Los módulos de operación y pagos conservan sus simulaciones, mientras la consulta/creación de pedidos del cliente usa el backend real. Las escrituras directas de estados/pagos están cerradas hasta implementar las RPCs correspondientes.
