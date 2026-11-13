import { beforeAll, beforeEach, afterAll, expect, test } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

const db = new PGlite();
const admin = '00000000-0000-0000-0000-000000000061';
const caja = '00000000-0000-0000-0000-000000000062';
const mesera = '00000000-0000-0000-0000-000000000063';
const cliente = '00000000-0000-0000-0000-000000000064';
const cocina = '00000000-0000-0000-0000-000000000065';
const destinatario = JSON.stringify({ name: 'Ana Prueba', phone: '987654321', address: 'Av. Prueba 123' });
async function asUser(user, sql, params = []) {
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [user]);
  await db.exec('SET ROLE authenticated');
  try { return await db.query(sql, params); }
  finally { await db.exec("RESET ROLE; SELECT set_config('request.jwt.claim.sub','',false)"); }
}
async function pedidoSalon(mesa, items) {
  const id = randomUUID();
  await asUser(mesera, "SELECT abrir_pedido_salon($1,$2,2,'',$3::jsonb)", [id, mesa, JSON.stringify(items)]);
  return id;
}
async function pedidoCliente(tipo, items) {
  const id = randomUUID();
  await asUser(cliente, 'SELECT crear_pedido_cliente($1,$2,$3::jsonb,$4::jsonb,$5)', [id, tipo, JSON.stringify(items), destinatario, 'efectivo']);
  return id;
}
async function cobrar(id, metodo, fecha) {
  const total = Number((await db.query('SELECT total FROM pedidos WHERE id=$1', [id])).rows[0].total);
  await asUser(caja, 'SELECT registrar_cobro($1,$2,$3,$4,$5,NULL)', [id, metodo, total, randomUUID(), total]);
  if (fecha) await db.query('UPDATE pagos SET creado_en=$2 WHERE pedido_id=$1', [id, fecha]);
  return total;
}
const dashboard = (user = admin, desde = null, hasta = null) =>
  asUser(user, 'SELECT obtener_dashboard_admin($1,$2) AS data', [desde, hasta]).then(r => r.rows[0].data);
const historial = (opciones = {}, user = admin) => {
  const { desde = null, hasta = null, limite = 10, fecha = null, id = null } = opciones;
  return asUser(user, 'SELECT obtener_historial_ventas($1,$2,$3,$4,$5) AS data', [desde, hasta, limite, fecha, id]).then(r => r.rows[0].data);
};
const hoyLima = async () => (await db.query("SELECT (now() AT TIME ZONE 'America/Lima')::date::text AS hoy")).rows[0].hoy;

beforeAll(async () => {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY,profile jsonb NOT NULL DEFAULT '{}');
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA auth,public TO authenticated,anon;
    CREATE SCHEMA realtime;
    CREATE TABLE realtime.channels(pattern text PRIMARY KEY,description text,enabled boolean);
    CREATE TABLE realtime.messages(channel_name text,event_name text,payload jsonb);
    GRANT USAGE ON SCHEMA realtime TO anon,authenticated;
    GRANT SELECT ON realtime.channels,realtime.messages TO anon,authenticated;
    GRANT INSERT ON realtime.messages TO anon,authenticated;
    CREATE FUNCTION realtime.channel_name() RETURNS text LANGUAGE sql STABLE AS $$ SELECT current_setting('test.channel',true) $$;
    CREATE FUNCTION realtime.publish(text,text,jsonb) RETURNS void LANGUAGE sql SECURITY DEFINER AS $$ INSERT INTO realtime.messages VALUES ($1,$2,$3) $$;
    REVOKE EXECUTE ON FUNCTION realtime.publish(text,text,jsonb) FROM PUBLIC,anon,authenticated;`);
  for (const base of ['../../insforge/migrations/', '../../migrations/']) {
    const root = new URL(base, import.meta.url);
    for (const name of (await readdir(root)).filter(n => n.endsWith('.sql')).sort()) await db.exec(await readFile(new URL(name, root), 'utf8'));
  }
  for (const [id, rol] of [[admin, 'admin'], [caja, 'caja'], [mesera, 'mesera'], [cliente, 'cliente'], [cocina, 'cocina']]) {
    await db.query('INSERT INTO auth.users(id) VALUES ($1)', [id]);
    await db.query('UPDATE perfiles SET rol=$2 WHERE id=$1', [id, rol]);
  }
  // Precios controlados del escenario de negocio; independientes de la carta comercial.
  await db.exec("UPDATE productos SET precio = CASE id WHEN 1 THEN 42.90 WHEN 2 THEN 24.90 WHEN 3 THEN 14.90 END WHERE id IN (1,2,3)")
}, 30000);
beforeEach(async () => { await db.exec("TRUNCATE pedidos CASCADE; UPDATE mesas SET estado='libre'"); });
afterAll(() => db.close());

test('los indicadores coinciden con los pagos registrados y excluyen pendientes y cancelados', async () => {
  const salon = await pedidoSalon(1, [{ id: 1, qty: 2 }]);
  const delivery = await pedidoCliente('delivery', [{ id: 2, qty: 1 }]);
  await cobrar(salon, 'efectivo'); await cobrar(delivery, 'yape');
  await pedidoSalon(2, [{ id: 1, qty: 5 }]);
  const cancelado = await pedidoCliente('recojo', [{ id: 3, qty: 1 }]);
  await db.query("UPDATE pedidos SET estado='cancelado' WHERE id=$1", [cancelado]);

  const data = await dashboard();
  const pagado = (await db.query('SELECT count(*)::int AS n, sum(monto)::float AS total FROM pagos')).rows[0];
  expect(data.resumen.total).toEqual({ cantidadPedidos: pagado.n, totalVentas: pagado.total });
  expect(data.resumen.total).toEqual({ cantidadPedidos: 2, totalVentas: 116.7 });
  expect(data.resumen.dia).toEqual(data.resumen.total);
  expect(data.metodosPago).toEqual([{ metodo: 'efectivo', cantidad: 1, total: 85.8 }, { metodo: 'yape', cantidad: 1, total: 30.9 }]);
  expect(data.productos.map(p => [p.productoId, p.cantidad, p.total])).toEqual([[1, 2, 85.8], [2, 1, 24.9]]);
  expect(data.productos[0]).toMatchObject({ nombre: 'Pollo a la brasa entero', imagen: expect.stringContaining('Pollo_entero.png') });
  expect(data.pedidosPendientes).toBe(1);
  expect(data.operativas.completados.at(-1)).toBe(2);
  expect(data.operativas.pendientes.at(-1)).toBe(1);
  expect(data.operativas.cancelados.at(-1)).toBe(1);
  expect(data.operativas.ventas.at(-1)).toBe(116.7);
});

test('agrupa por la fecha del cobro en hora de Lima y filtra por rango', async () => {
  const noche = await pedidoSalon(1, [{ id: 1, qty: 1 }]), siguiente = await pedidoSalon(2, [{ id: 3, qty: 1 }]);
  await cobrar(noche, 'tarjeta', '2026-10-10T03:30:00Z'); // 9 de octubre, 22:30 en Lima
  await cobrar(siguiente, 'plin', '2026-10-10T15:00:00Z');
  const data = await dashboard(admin, '2026-10-09', '2026-10-09');
  expect(data.resumen.total).toEqual({ cantidadPedidos: 1, totalVentas: 42.9 });
  expect(data.ventasPorDia).toEqual([{ fecha: '2026-10-09', cantidad: 1, total: 42.9 }]);
  expect(data.metodosPago).toEqual([{ metodo: 'tarjeta', cantidad: 1, total: 42.9 }]);
  expect((await dashboard(admin, '2026-10-10', null)).ventasPorDia).toEqual([{ fecha: '2026-10-10', cantidad: 1, total: 14.9 }]);
  expect((await dashboard(admin, null, '2026-10-08')).resumen.total).toEqual({ cantidadPedidos: 0, totalVentas: 0 });
  await expect(dashboard(admin, '2026-10-10', '2026-10-09')).rejects.toThrow(/posterior/);
});

test('calcula ventas del día, semana y mes respecto de la fecha actual', async () => {
  const hoy = await hoyLima();
  const [actual, hace3, hace40] = [await pedidoSalon(1, [{ id: 1, qty: 1 }]), await pedidoSalon(2, [{ id: 2, qty: 1 }]), await pedidoSalon(3, [{ id: 3, qty: 1 }])];
  await cobrar(actual, 'efectivo');
  await cobrar(hace3, 'efectivo', (await db.query("SELECT now() - interval '3 days' AS f")).rows[0].f);
  await cobrar(hace40, 'efectivo', (await db.query("SELECT now() - interval '40 days' AS f")).rows[0].f);
  const { resumen, tendencias, operativas, hoy: servidor } = await dashboard();
  expect(servidor).toBe(hoy);
  expect(resumen.dia).toEqual({ cantidadPedidos: 1, totalVentas: 42.9 });
  expect(resumen.semana).toEqual({ cantidadPedidos: 2, totalVentas: 67.8 });
  expect(resumen.total).toEqual({ cantidadPedidos: 3, totalVentas: 82.7 });
  const diaDelMes = Number(hoy.slice(8));
  expect(resumen.mes.cantidadPedidos).toBe(diaDelMes > 3 ? 2 : 1);
  expect(tendencias.dia.values).toHaveLength(24);
  expect(tendencias.dia.values.reduce((a, b) => a + b, 0)).toBe(42.9);
  expect(tendencias.semana.values).toHaveLength(7);
  expect(tendencias.mes.labels[0]).toBe('1');
  expect(tendencias.mes.values[diaDelMes - 1]).toBe(42.9);
  expect(tendencias.total.values).toHaveLength(12);
  expect(operativas.fechas).toHaveLength(5);
  expect(operativas.fechas.at(-1)).toBe(hoy);
  expect(operativas.completados).toEqual([0, 1, 0, 0, 1]);
});

test('sin ventas devuelve indicadores en cero', async () => {
  const data = await dashboard();
  expect(data.resumen.total).toEqual({ cantidadPedidos: 0, totalVentas: 0 });
  expect(data).toMatchObject({ productos: [], metodosPago: [], ventasPorDia: [], pedidosPendientes: 0 });
  expect(await historial()).toEqual({ ventas: [], siguiente: null });
});

test('pagina el historial por fecha de cobro sin repetir ni omitir ventas', async () => {
  const ids = [];
  for (let i = 0; i < 5; i++) {
    const id = await pedidoCliente('recojo', [{ id: 3, qty: 1 }]);
    await cobrar(id, i % 2 ? 'yape' : 'efectivo', `2026-10-0${i + 1}T17:00:00Z`);
    ids.push(id);
  }
  const primera = await historial({ limite: 2 });
  expect(primera.ventas.map(v => v.id)).toEqual([ids[4], ids[3]]);
  expect(primera.ventas[0]).toMatchObject({ codigo: ids[4], cliente: 'Ana Prueba', tipo: 'recojo', total: 14.9, pago: { metodo: 'efectivo' } });
  const segunda = await historial({ limite: 2, ...primera.siguiente });
  const tercera = await historial({ limite: 2, ...segunda.siguiente });
  expect([...segunda.ventas, ...tercera.ventas].map(v => v.id)).toEqual([ids[2], ids[1], ids[0]]);
  expect(tercera.siguiente).toBeNull();
  expect((await historial({ desde: '2026-10-02', hasta: '2026-10-03' })).ventas.map(v => v.id)).toEqual([ids[2], ids[1]]);
  expect((await historial({ limite: 0 })).ventas).toHaveLength(1);
  await expect(historial({ fecha: '2026-10-03T00:00:00Z' })).rejects.toThrow(/cursor/);
});

test('muestra la mesa en el historial de ventas de salón', async () => {
  const id = await pedidoSalon(1, [{ id: 1, qty: 1 }]); await cobrar(id, 'efectivo');
  expect((await historial()).ventas[0]).toMatchObject({ id, mesa: '01', cliente: 'Mesa 01', tipo: 'salon' });
});

test.each([['caja', caja], ['mesera', mesera], ['cliente', cliente], ['cocina', cocina], ['usuario sin perfil', randomUUID()], ['sesión vacía', '']])(
  'rechaza el dashboard y el historial para %s', async (_rol, user) => {
    await expect(dashboard(user)).rejects.toThrow(/Solo un administrador/);
    await expect(historial({}, user)).rejects.toThrow(/Solo un administrador/);
  });

test('el rol anónimo no puede ejecutar las funciones del dashboard', async () => {
  await db.exec('SET ROLE anon');
  try {
    await expect(db.query('SELECT obtener_dashboard_admin()')).rejects.toThrow(/permission denied/);
    await expect(db.query('SELECT obtener_historial_ventas()')).rejects.toThrow(/permission denied/);
  } finally { await db.exec('RESET ROLE'); }
});
