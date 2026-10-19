# Dashboard administrativo (EPIC 7 — SCRUM-301)

Rama base `feature/integracion` (`0fdee1b`), que ya incorpora Login, Catálogo, Pedidos de Cliente, Meseras, Caja y Cocina. Los indicadores dejan de calcularse en el navegador a partir de todos los pedidos descargados: PostgreSQL los calcula con los pagos registrados por `registrar_cobro`.

## Correspondencia con Jira

| Tarea | Implementación |
| --- | --- |
| SCRUM-302 Consultar ventas calculadas con pagos reales | `obtener_dashboard_admin` suma `pagos.monto`: solo cuenta pedidos con un pago registrado. Los pedidos pendientes o cancelados no suman ventas. |
| SCRUM-303 Ventas del día, semana, mes y rango | `resumen.dia`, `resumen.semana` (últimos 7 días), `resumen.mes` y `resumen.total` dentro del rango `p_desde`–`p_hasta`. Las fechas se agrupan por la fecha del cobro en `America/Lima`. |
| SCRUM-304 Cantidad de pedidos y productos más vendidos | `cantidadPedidos` por periodo y `productos` (cantidad e importe vendidos con el precio guardado en el detalle), ordenados por cantidad. Métricas operativas de los últimos 5 días y `pedidosPendientes`. |
| SCRUM-305 Ventas por método de pago | `metodosPago`: Efectivo, Tarjeta, Yape y Plin, con cantidad y total. |
| SCRUM-306 Historial de ventas | `obtener_historial_ventas`, paginado por fecha de cobro con cursor (`fecha`, `id` del pago); límite de 1 a 100 filas. La pantalla muestra «Ver más ventas». |
| SCRUM-307 Restringir los datos al Administrador | Las dos funciones son `SECURITY DEFINER`, verifican `rol_actual() = 'admin'` (error `42501` para los demás) y no se conceden a `anon`. El servicio del navegador tampoco consulta sin una sesión de administrador, y la ruta `/dashboard` ya exigía ese rol. |

**Criterio de aceptación:** la prueba `tests/dashboard-database.test.js` compara los indicadores con `SELECT count(*), sum(monto) FROM pagos` sobre las migraciones reales.

## Archivos

- `migrations/20261017170000_dashboard-admin.sql`: índice `pagos(creado_en, id)` y las funciones `obtener_dashboard_admin(p_desde date, p_hasta date)` y `obtener_historial_ventas(p_desde, p_hasta, p_limite, p_antes_fecha, p_antes_id)`. No crea tablas ni modifica datos.
- `Front-Polleria-LYS-main/src/services/dashboardService.js`: llamadas a las RPC y normalización de importes.
- `Front-Polleria-LYS-main/src/pages/DashboardAdminPage.jsx` y `components/admin/HistorialVentas.jsx`: carga, refresco por sello de cambios (cada 10 s, pausado con la pestaña oculta) y paginación.
- `cajaService.js` conserva solo `calcularTotal`, que usa Caja; se eliminaron los cálculos locales del dashboard y su prueba.

## Despliegue en InsForge

Desde la raíz del repositorio, vinculado al proyecto **Backend-Polleria-LYS** (`https://b9zz47j5.us-east.insforge.app`):

```bash
npx -y @insforge/cli db migrations list --json
npx -y @insforge/cli db migrations up 20261017170000 --json
```

Requiere la migración de Caja `20261016194047`; si falta, la migración se detiene sin cambios.

## Validación

```bash
cd Front-Polleria-LYS-main
npm ci
npm test                    # incluye dashboard-database y dashboard-service
npm run build
npm run test:e2e            # incluye e2e/dashboard.spec.js
npm run test:dashboard-read # contra el backend real: rechaza el acceso anónimo
```
