import { beforeAll, beforeEach, afterAll, expect, test } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

const db = new PGlite();
const caja = '00000000-0000-0000-0000-000000000031';
const mesera = '00000000-0000-0000-0000-000000000032';
const cliente = '00000000-0000-0000-0000-000000000033';
const admin = '00000000-0000-0000-0000-000000000034';
const token = '00000000-0000-0000-0000-000000000099';
async function asUser(user, sql, params = []) {
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [user]);
  await db.exec('SET ROLE authenticated');
  try { return await db.query(sql, params); }
  finally { await db.exec("RESET ROLE; SELECT set_config('request.jwt.claim.sub','',false)"); }
}
async function pedido(mesa = 1, items = [{ id: 1, qty: 1 }]) {
  const id = randomUUID();
  await asUser(mesera, "SELECT abrir_pedido_salon($1,$2,2,'',$3::jsonb)", [id, mesa, JSON.stringify(items)]);
  await asUser(mesera, 'SELECT solicitar_cuenta_salon($1)', [id]);
  return id;
}
async function cobrar(id, { user = caja, metodo = 'efectivo', recibido = 50, clave = token, total = 42.9, referencia = null } = {}) {
  return (await asUser(user, 'SELECT registrar_cobro($1,$2,$3,$4,$5,$6) AS recibo', [id, metodo, recibido, clave, total, referencia])).rows[0].recibo;
}
beforeAll(async () => {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY,profile jsonb NOT NULL DEFAULT '{}');
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA auth,public TO authenticated,anon;`);
  const root = new URL('../../insforge/migrations/', import.meta.url);
  for (const name of (await readdir(root)).filter(n => n.endsWith('.sql')).sort()) await db.exec(await readFile(new URL(name, root), 'utf8'));
  await db.exec(await readFile(new URL('../../migrations/20261016194047_caja-pagos.sql', import.meta.url), 'utf8'));
  for (const [id, rol] of [[caja, 'caja'], [mesera, 'mesera'], [cliente, 'cliente'], [admin, 'admin']]) {
    await db.query('INSERT INTO auth.users(id) VALUES ($1)', [id]);
    await db.query('UPDATE perfiles SET rol=$2 WHERE id=$1', [id, rol]);
  }
  // Precios controlados del escenario de negocio; independientes de la carta comercial.
  await db.exec("UPDATE productos SET precio = CASE id WHEN 1 THEN 42.90 WHEN 2 THEN 24.90 WHEN 3 THEN 14.90 END WHERE id IN (1,2,3)")
}, 30000);
beforeEach(async () => { await db.exec("TRUNCATE pedidos CASCADE; UPDATE mesas SET estado='libre'"); });
afterAll(() => db.close());

test('cobra el total persistido, calcula vuelto, audita y libera la mesa en una operación', async () => {
  const id = await pedido(), recibo = await cobrar(id);
  expect(recibo).toMatchObject({ id, codigo: id, mesa: '01', total: 42.9, estado: 'pagado', pago: { metodo: 'efectivo', monto: 50, importe: 42.9, vuelto: 7.1, registradoPor: caja } });
  expect(recibo.items[0]).toMatchObject({ nombre: 'Pollo a la brasa entero', precio: 42.9, cantidad: 1 });
  expect((await db.query('SELECT estado_pago,estado,cuenta_solicitada FROM pedidos WHERE id=$1', [id])).rows[0]).toEqual({ estado_pago: 'pagado', estado: 'entregado', cuenta_solicitada: false });
  expect((await db.query('SELECT estado FROM mesas WHERE id=1')).rows[0].estado).toBe('libre');
  expect((await db.query("SELECT cambiado_por FROM historial_estados_pedido WHERE pedido_id=$1 AND estado='entregado'", [id])).rows[0].cambiado_por).toBe(caja);
  const mesas = (await asUser(mesera, 'SELECT obtener_mesas_con_pedidos() AS data')).rows[0].data;
  expect(mesas.find(m => m.id === 1)).toMatchObject({ estado: 'libre', pedido_id: null });
});
test('recupera exactamente el mismo comprobante ante una respuesta perdida', async () => {
  const id = await pedido(), recibo = await cobrar(id);
  expect(await cobrar(id)).toEqual(recibo);
  expect((await db.query('SELECT * FROM pagos WHERE pedido_id=$1', [id])).rows).toHaveLength(1);
  await expect(cobrar(id, { clave: randomUUID() })).rejects.toThrow(/ya fue cobrado/);
  await expect(cobrar(id, { recibido: 100 })).rejects.toThrow(/ya fue cobrado/);
});
test.each(['tarjeta', 'yape', 'plin'])('registra %s con el importe exacto y sin vuelto', async metodo => {
  const id = await pedido();
  expect((await cobrar(id, { user: admin, metodo, recibido: 42.9, referencia: ' OP-123 ' })).pago).toMatchObject({ metodo, monto: 42.9, vuelto: 0, referencia: 'OP-123' });
});
test.each([
  ['efectivo insuficiente', { recibido: 42 }], ['monto negativo', { recibido: -50 }],
  ['fracción de céntimo', { recibido: 50.001 }], ['monto no finito', { recibido: 'NaN' }],
  ['método inválido', { metodo: 'gratis' }], ['método nulo', { metodo: null }],
  ['sobrante digital', { metodo: 'yape', recibido: 50 }], ['sin clave', { clave: null }],
  ['referencia extensa', { referencia: 'x'.repeat(121) }], ['total manipulado', { total: 0.01 }],
  ['total nulo', { total: null }], ['sin monto', { recibido: null }],
])('rechaza %s sin registrar pagos ni liberar la mesa', async (_name, options) => {
  const id = await pedido(); await expect(cobrar(id, options)).rejects.toThrow();
  expect((await db.query('SELECT * FROM pagos')).rows).toHaveLength(0);
  expect((await db.query('SELECT estado FROM mesas WHERE id=1')).rows[0].estado).toBe('ocupada');
  expect((await db.query('SELECT estado_pago FROM pedidos WHERE id=$1', [id])).rows[0].estado_pago).toBe('pendiente');
});
test('exige revisar la cuenta cuando cambia la comanda', async () => {
  const id = await pedido();
  await asUser(mesera, 'SELECT agregar_o_modificar_detalles_salon($1,$2::jsonb)', [id, JSON.stringify([{ id: 2, qty: 1 }])]);
  await expect(cobrar(id)).rejects.toThrow(/total cambió/);
});
test('rechaza pedidos cancelados, inexistentes y sin productos', async () => {
  const id = await pedido(); await db.query("UPDATE pedidos SET estado='cancelado' WHERE id=$1", [id]);
  await expect(cobrar(id)).rejects.toThrow(/no admite/);
  await expect(cobrar(randomUUID())).rejects.toThrow(/no existe/);
  await expect(cobrar(await pedido(2, []))).rejects.toThrow(/sin productos/);
});
test.each(['recojo', 'delivery'])('cobra %s sin alterar su estado operativo', async tipo => {
  const id = randomUUID(), total = tipo === 'delivery' ? 48.9 : 42.9;
  await asUser(cliente, 'SELECT crear_pedido_cliente($1,$2,$3::jsonb,$4::jsonb,$5)', [id, tipo, JSON.stringify([{ id: 1, qty: 1 }]), JSON.stringify({ name: 'Ana Prueba', phone: '987654321', address: 'Av. Prueba 123' }), 'efectivo']);
  const recibo = await cobrar(id, { total });
  expect(recibo).toMatchObject({ estadoPedido: 'pendiente', total, cliente: 'Ana Prueba', envio: tipo === 'delivery' ? 6 : 0 });
  expect((await db.query('SELECT estado FROM pedidos WHERE id=$1', [id])).rows[0].estado).toBe('pendiente');
});
test('cliente, mesera y usuario sin perfil no pueden cobrar ni insertar pagos directamente', async () => {
  const id = await pedido();
  for (const user of [cliente, mesera, randomUUID(), '']) await expect(cobrar(id, { user })).rejects.toThrow(/Solo caja/);
  await expect(asUser(caja, "INSERT INTO pagos(pedido_id,registrado_por,monto,metodo,recibido,vuelto) VALUES ($1,$2,42.9,'efectivo',50,7.1)", [id,caja])).rejects.toThrow(/permission denied/);
});
test('la clave no puede reutilizarse para otro pedido y revierte el segundo cobro', async () => {
  await cobrar(await pedido()); const segundo = await pedido();
  await expect(cobrar(segundo)).rejects.toThrow(/unique/);
  expect((await db.query('SELECT estado_pago FROM pedidos WHERE id=$1', [segundo])).rows[0].estado_pago).toBe('pendiente');
  expect((await db.query('SELECT estado FROM mesas WHERE id=1')).rows[0].estado).toBe('ocupada');
});
test('impide liberar o cerrar una mesa pendiente mediante RPC o escritura directa', async () => {
  const id = await pedido();
  await expect(asUser(mesera, 'SELECT liberar_mesa_salon(1)')).rejects.toThrow(/pago/);
  await expect(asUser(mesera, "UPDATE mesas SET estado='libre' WHERE id=1")).rejects.toThrow(/pendiente de pago/);
  await expect(db.query("UPDATE pedidos SET estado='entregado' WHERE id=$1", [id])).rejects.toThrow(/pago/);
});
test('impide editar productos, importes y solicitud de cuenta después del cobro', async () => {
  const id = await pedido(), recibo = await cobrar(id);
  await expect(asUser(mesera, 'SELECT agregar_o_modificar_detalles_salon($1,$2::jsonb)', [id,JSON.stringify([{ id: 1, qty: 1 }])])).rejects.toThrow(/finalizado/);
  await expect(db.query('INSERT INTO detalles_pedido(pedido_id,producto_id,cantidad,precio_unitario) VALUES ($1,1,1,1)', [id])).rejects.toThrow(/cobrado/);
  for (const sql of ['UPDATE detalles_pedido SET cantidad=3 WHERE pedido_id=$1', 'DELETE FROM detalles_pedido WHERE pedido_id=$1', 'UPDATE pedidos SET subtotal=1 WHERE id=$1', 'UPDATE pedidos SET total=1 WHERE id=$1', "UPDATE pedidos SET estado='pendiente' WHERE id=$1"]) await expect(db.query(sql, [id])).rejects.toThrow(/cobrado/);
  await expect(asUser(mesera, 'SELECT solicitar_cuenta_salon($1)', [id])).rejects.toThrow(/cobrado/);
  expect(await cobrar(id)).toEqual(recibo);
});
test('no libera una mesa reutilizada al reintentar un cobro anterior', async () => {
  const id = await pedido(), recibo = await cobrar(id); await pedido();
  expect(await cobrar(id)).toEqual(recibo);
  expect((await db.query('SELECT estado FROM mesas WHERE id=1')).rows[0].estado).toBe('ocupada');
});
test('revierte pago, cierre e historial si falla la liberación de mesa', async () => {
  const id = await pedido();
  await db.exec(`CREATE FUNCTION public.fallar_liberacion() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Fallo controlado'; END; $$;
    CREATE TRIGGER zz_fallar BEFORE UPDATE ON mesas FOR EACH ROW EXECUTE FUNCTION public.fallar_liberacion();`);
  try { await expect(cobrar(id)).rejects.toThrow(/Fallo controlado/); }
  finally { await db.exec('DROP TRIGGER zz_fallar ON mesas; DROP FUNCTION fallar_liberacion()'); }
  expect((await db.query('SELECT * FROM pagos')).rows).toHaveLength(0);
  expect((await db.query('SELECT estado_pago,estado,cuenta_solicitada FROM pedidos WHERE id=$1', [id])).rows[0]).toMatchObject({ estado_pago: 'pendiente', estado: 'pendiente', cuenta_solicitada: true });
  expect((await db.query('SELECT * FROM historial_estados_pedido WHERE pedido_id=$1', [id])).rows).toHaveLength(1);
});
test('el sello cambia con artículos y cobros para refrescar caja sin descargar todo en cada intervalo', async () => {
  const id = await pedido();
  const sello = async () => (await db.query('SELECT actualizado_en::text AS fecha FROM pedidos WHERE id=$1', [id])).rows[0].fecha;
  const antes = await sello(); await asUser(mesera, 'SELECT agregar_o_modificar_detalles_salon($1,$2::jsonb)', [id,JSON.stringify([{ id: 1, qty: 2 }])]);
  expect(await sello()).not.toBe(antes);
  const editado = await sello(); await cobrar(id, { total: 85.8, recibido: 100 });
  expect(await sello()).not.toBe(editado);
});
