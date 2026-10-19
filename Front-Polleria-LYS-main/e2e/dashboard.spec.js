import { test, expect } from './fixtures';
const identity = { id: '00000000-0000-0000-0000-000000000034', email: 'admin@example.test', emailVerified: true, profile: { name: 'Admin' } };
const venta = n => ({ id: `00000000-0000-0000-0000-00000000010${n}`, codigo: `00000000-0000-0000-0000-00000000010${n}`, pagoId: `00000000-0000-0000-0000-00000000020${n}`,
  tipo: 'recojo', mesa: null, cliente: `Cliente ${n}`, total: 14.9, pagadoAt: `2026-10-0${n}T17:00:00Z`, pago: { metodo: 'plin' } });
async function backend(page, { role = 'admin', error = '' } = {}) {
  const calls = { dashboard: [], historial: [] };
  await page.route('https://b9zz47j5.us-east.insforge.app/**', async route => {
    const req = route.request(), path = new URL(req.url()).pathname;
    let response = {}, status = 200;
    if (path === '/api/auth/refresh') {
      const token = `${btoa(JSON.stringify({ alg: 'HS256' }))}.${btoa(JSON.stringify({ sub: identity.id, exp: Math.floor(Date.now()/1000)+3600 }))}.signature`;
      response = { user: identity, accessToken: token };
    } else if (path === '/api/auth/public-config') response = { oAuthProviders: [] };
    else if (path === '/api/database/records/perfiles') response = { id: identity.id, nombre: 'Admin', apellido: 'Prueba', rol: role, preferencias: {} };
    else if (path === '/api/database/records/pedidos') response = [{ actualizado_en: '2026-10-16T19:00:00Z' }];
    else if (path.includes('/rpc/obtener_dashboard_admin')) {
      calls.dashboard.push(req.postDataJSON());
      if (error) { status = 403; response = { message: error }; }
      else response = { hoy: '2026-10-09',
        resumen: { dia: { cantidadPedidos: 1, totalVentas: '14.90' }, semana: { cantidadPedidos: 3, totalVentas: '44.70' }, mes: { cantidadPedidos: 3, totalVentas: '44.70' }, total: { cantidadPedidos: 3, totalVentas: '44.70' } },
        productos: [{ productoId: 3, nombre: '1/4 Pollo a la brasa', cantidad: 3, total: '44.70' }],
        metodosPago: [{ metodo: 'plin', cantidad: 3, total: '44.70' }], ventasPorDia: [{ fecha: '2026-10-09', cantidad: 1, total: '14.90' }],
        tendencias: {}, operativas: { fechas: ['2026-10-09'], completados: [1], pendientes: [0], cancelados: [0], ventas: ['14.90'] }, pedidosPendientes: 2 };
    } else if (path.includes('/rpc/obtener_historial_ventas')) {
      const body = req.postDataJSON(); calls.historial.push(body);
      response = body.p_antes_id ? { ventas: [venta(1)], siguiente: null }
        : { ventas: [venta(3), venta(2)], siguiente: { fecha: '2026-10-02T17:00:00.123456+00:00', id: venta(2).pagoId } };
    }
    await route.fulfill({ status, headers: { 'content-range': '0-0/3' }, contentType: 'application/json', body: JSON.stringify(response) });
  });
  return calls;
}

test('muestra los indicadores calculados por el servidor y pagina el historial', async ({ page }) => {
  const calls = await backend(page); await page.goto('/dashboard');
  await expect(page.locator('.admin-summary-card').filter({ hasText: 'Ingresos totales' })).toContainText('44.70');
  await expect(page.locator('.admin-products-table')).toContainText('1/4 Pollo a la brasa');
  await expect(page.locator('.admin-history-table tbody tr')).toHaveCount(2);
  await page.getByRole('button', { name: 'Ver más ventas' }).click();
  await expect(page.locator('.admin-history-table tbody tr')).toHaveCount(3);
  await expect(page.getByRole('button', { name: 'Ver más ventas' })).toHaveCount(0);
  expect(calls.historial.at(-1)).toMatchObject({ p_antes_fecha: '2026-10-02T17:00:00.123456+00:00', p_antes_id: venta(2).pagoId });
});
test('envía el rango de fechas al servidor', async ({ page }) => {
  const calls = await backend(page); await page.goto('/dashboard');
  await expect(page.locator('.admin-history-table tbody tr')).toHaveCount(2);
  await page.getByLabel('Desde').fill('2026-10-01');
  await expect.poll(() => calls.dashboard.at(-1)).toEqual({ p_desde: '2026-10-01', p_hasta: null });
  expect(calls.historial.at(-1)).toMatchObject({ p_desde: '2026-10-01', p_hasta: null, p_antes_id: null });
});
test('muestra el rechazo del servidor', async ({ page }) => {
  await backend(page, { error: 'Solo un administrador puede consultar el dashboard' }); await page.goto('/dashboard');
  await expect(page.getByRole('alert')).toContainText('Solo un administrador');
});
test('caja no accede al dashboard ni consulta sus indicadores', async ({ page }) => {
  const calls = await backend(page, { role: 'caja' }); await page.goto('/dashboard');
  await expect(page).not.toHaveURL(/\/dashboard$/);
  expect(calls.dashboard).toHaveLength(0); expect(calls.historial).toHaveLength(0);
});
test('se adapta al móvil sin desbordar', async ({ page }) => {
  await backend(page); await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/dashboard');
  await expect(page.locator('.admin-history-table tbody tr')).toHaveCount(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
