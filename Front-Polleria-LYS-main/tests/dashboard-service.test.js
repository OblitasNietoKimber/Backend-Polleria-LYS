import { beforeEach, expect, test, vi } from 'vitest';
const rpc = vi.fn(), user = { rol: 'admin' };
vi.mock('../src/lib/insforge', () => ({ configurationError: null, insforge: { database: { rpc: (...args) => rpc(...args) } } }));
vi.mock('../src/services/authService', () => ({ getCurrentUser: () => user }));
import dashboard, { normalizarDashboard } from '../src/services/dashboardService';
beforeEach(() => { rpc.mockReset(); user.rol = 'admin'; });

test('consulta los indicadores en el servidor con el rango elegido', async () => {
  rpc.mockResolvedValue({ data: { resumen: { total: { cantidadPedidos: 2, totalVentas: '73.80' } }, metodosPago: [{ metodo: 'yape', cantidad: 1, total: '48.90' }] }, error: null });
  const data = await dashboard.getDashboard({ fechaInicio: '2026-10-01', fechaFin: '' });
  expect(rpc).toHaveBeenCalledWith('obtener_dashboard_admin', { p_desde: '2026-10-01', p_hasta: null });
  expect(data.resumen.total).toEqual({ cantidadPedidos: 2, totalVentas: 73.8 });
  expect(data.resumen.dia).toEqual({ cantidadPedidos: 0, totalVentas: 0 });
  expect(data.metodosPago).toEqual([{ nombre: 'Yape', cantidad: 1, total: 48.9 }]);
});
test('pagina el historial con el cursor devuelto por el servidor', async () => {
  const siguiente = { fecha: '2026-10-09T19:00:00.123456+00:00', id: '00000000-0000-0000-0000-000000000051' };
  rpc.mockResolvedValue({ data: { ventas: [{ id: 'p1', total: '42.90', pago: { metodo: 'efectivo' } }], siguiente }, error: null });
  const pagina = await dashboard.getHistorialVentas({}, { siguiente });
  expect(rpc).toHaveBeenCalledWith('obtener_historial_ventas', { p_desde: null, p_hasta: null, p_limite: 10, p_antes_fecha: siguiente.fecha, p_antes_id: siguiente.id });
  expect(pagina).toEqual({ ventas: [{ id: 'p1', total: 42.9, pago: { metodo: 'Efectivo', metodoId: 'efectivo' } }], siguiente });
});
test('muestra el error del servidor', async () => {
  rpc.mockResolvedValue({ data: null, error: { message: 'Solo un administrador puede consultar el dashboard' } });
  await expect(dashboard.getDashboard()).rejects.toThrow(/Solo un administrador/);
});
test.each(['caja', 'mesera', 'cocina', 'cliente'])('no consulta el dashboard con rol %s', async rol => {
  user.rol = rol;
  await expect(dashboard.getDashboard()).rejects.toThrow(/administrador/);
  await expect(dashboard.getHistorialVentas()).rejects.toThrow(/administrador/);
  expect(rpc).not.toHaveBeenCalled();
});
test('sin datos devuelve indicadores vacíos', () => {
  const data = normalizarDashboard();
  expect(data).toMatchObject({ productos: [], metodosPago: [], ventasPorDia: [], pedidosPendientes: 0 });
  expect(data.tendencias.dia).toEqual({ labels: [], values: [] });
});
