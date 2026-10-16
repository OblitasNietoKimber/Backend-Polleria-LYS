import { beforeAll, afterAll, afterEach, expect, test } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFile, readdir } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
const db = new PGlite()
const roles = ['cliente', 'cliente', 'mesera', 'cocina', 'caja', 'admin']
const users = roles.map((_, i) => `10000000-0000-0000-0000-${String(i + 1).padStart(12, '0')}`)
const legacy = '20000000-0000-0000-0000-000000000001'
const delivery = { name: 'Cliente Prueba', phone: '987654321', address: 'Av. Prueba 123', reference: '' }
const directory = new URL('../../insforge/migrations/', import.meta.url)
async function asUser(index, sql, values = []) {
  await db.exec(`SET ROLE ${index === null ? 'anon' : 'authenticated'}; SELECT set_config('request.jwt.claim.sub','${index === null ? '' : users[index]}',false)`)
  try { return await db.query(sql, values) }
  finally { await db.exec("RESET ROLE; SELECT set_config('request.jwt.claim.sub','',false)") }
}
function request(overrides = {}) {
  return { id: randomUUID(), type: 'delivery', items: [{ id: 900001, qty: 2 }], form: delivery, method: 'efectivo', ...overrides }
}
async function create(input = request(), user = 0) {
  return asUser(user, 'SELECT public.crear_pedido_cliente($1,$2,$3::jsonb,$4::jsonb,$5) AS id',
    [input.id, input.type, JSON.stringify(input.items), JSON.stringify(input.form), input.method])
}
beforeAll(async () => {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY,profile jsonb NOT NULL DEFAULT '{}');
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA auth,public TO anon,authenticated;`)
  const files = (await readdir(directory)).filter(file => file.endsWith('.sql')).sort()
  for (const file of files.filter(file => file < '009')) await db.exec(await readFile(new URL(file, directory), 'utf8'))
  for (let i = 0; i < users.length; i++) {
    await db.query('INSERT INTO auth.users(id) VALUES ($1)', [users[i]])
    await db.query('UPDATE public.perfiles SET rol=$2 WHERE id=$1', [users[i], roles[i]])
  }
  await db.exec(`INSERT INTO public.productos(id,categoria_id,nombre,precio,disponible)
    VALUES (900001,'pollos','Nombre vendido',42.90,true),(900002,'pollos','Segundo plato',10,true)`)
  await create(request({ id: legacy }))
  for (const file of files.filter(file => file >= '009')) await db.exec(await readFile(new URL(file, directory), 'utf8'))
  await db.exec(await readFile(new URL('../../migrations/20261016194047_caja-pagos.sql', import.meta.url), 'utf8'))
}, 30000)
afterAll(() => db.close())
afterEach(async () => {
  await db.query('DELETE FROM public.detalles_pedido WHERE pedido_id<>$1', [legacy])
  await db.query('DELETE FROM public.pedidos WHERE id<>$1', [legacy])
  await db.exec("UPDATE public.productos SET precio=42.90,nombre='Nombre vendido',disponible=true WHERE id=900001")
})
test('conserva UUID, importes, detalles y una instantánea explícita de pedidos anteriores', async () => {
  const row = (await asUser(0, 'SELECT id,total,subtotal,envio FROM public.pedidos WHERE id=$1', [legacy])).rows[0]
  expect(row.id).toBe(legacy); expect(Number(row.total)).toBe(91.8); expect(Number(row.subtotal)).toBe(85.8)
  const history = (await asUser(0, 'SELECT * FROM public.historial_estados_pedido WHERE pedido_id=$1', [legacy])).rows
  expect(history).toHaveLength(1); expect(history[0]).toMatchObject({ estado: 'pendiente', cambiado_por: null, es_reconstruido: true })
  expect((await create(request({ id: legacy }))).rows[0].id).toBe(legacy)
})
test.each([['delivery', 6], ['recojo', 0]])('calcula %s con precios reales e ignora precios enviados', async (type, fee) => {
  const input = request({ type, items: [{ id: 900001, qty: 2, price: 0 }, { id: 900002, qty: 3, price: 0 }] })
  await create(input)
  const row = (await asUser(0, 'SELECT * FROM public.pedidos WHERE id=$1', [input.id])).rows[0]
  expect(Number(row.subtotal)).toBe(115.8); expect(Number(row.envio)).toBe(fee); expect(Number(row.total)).toBe(115.8 + fee)
  expect(row).toMatchObject({ cliente_id: users[0], creado_por: users[0], estado: 'pendiente', metodo_solicitado: 'efectivo' })
  const details = (await asUser(0, 'SELECT * FROM public.detalles_pedido WHERE pedido_id=$1 ORDER BY producto_id', [input.id])).rows
  expect(details).toHaveLength(2); expect(details[0].nombre_producto).toBe('Nombre vendido'); expect(Number(details[0].precio_unitario)).toBe(42.9)
  expect((await db.query('SELECT * FROM public.pagos WHERE pedido_id=$1', [input.id])).rows).toEqual([])
  if (type === 'recojo') expect(row.destinatario.address).toBe('')
})
test('reintenta sin duplicar incluso si cambia el catálogo y normaliza el orden del carrito', async () => {
  const input = request({ items: [{ id: 900002, qty: 1 }, { id: 900001, qty: 2 }] })
  await create(input)
  await db.exec("UPDATE public.productos SET precio=100,nombre='Otro nombre',disponible=false WHERE id=900001")
  const retry = await create({ ...input, items: [...input.items].reverse() })
  expect(retry.rows[0].id).toBe(input.id)
  expect((await db.query('SELECT * FROM public.detalles_pedido WHERE pedido_id=$1', [input.id])).rows).toHaveLength(2)
  expect((await db.query('SELECT * FROM public.historial_estados_pedido WHERE pedido_id=$1', [input.id])).rows).toHaveLength(1)
})
test.each(['cantidad', 'contacto', 'metodo', 'tipo', 'propietario'])('rechaza reutilizar la solicitud cambiando %s', async field => {
  const input = request(); await create(input)
  const changes = { cantidad: { items: [{ id: 900001, qty: 3 }] }, contacto: { form: { ...delivery, name: 'Otra persona' } },
    metodo: { method: 'yape' }, tipo: { type: 'recojo' }, propietario: {} }
  await expect(create({ ...input, ...changes[field] }, field === 'propietario' ? 1 : 0)).rejects.toThrow(/solicitud ya fue utilizada/)
})
test.each([
  { items: [] }, { items: {} }, { items: null }, { items: [null] }, { items: [{ id: 900001, qty: 0 }] },
  { items: [{ id: 900001, qty: -1 }] }, { items: [{ id: 900001, qty: 1.5 }] }, { items: [{ id: 900001, qty: 101 }] },
  { items: [{ id: 900001, qty: 'abc' }] }, { items: [{ id: 'abc', qty: 1 }] }, { items: [{ id: 900001 }] },
  { items: [{ id: 900001, qty: 1 }, { id: 900001, qty: 2 }] }, { type: 'salon' }, { method: null }, { method: 'gratis' },
  { form: null }, { form: [] }, { form: { ...delivery, name: ' ' } }, { form: { ...delivery, phone: '123' } },
  { form: { ...delivery, address: '' } }, { form: { ...delivery, reference: 'x'.repeat(501) } },
  { form: { ...delivery, name: 'x'.repeat(121) } }, { form: { ...delivery, reference: {} } },
])('valida los datos antes de guardar: %j', async overrides => {
  const input = request(overrides)
  await expect(create(input)).rejects.toThrow()
  expect((await db.query('SELECT id FROM public.pedidos WHERE id=$1', [input.id])).rows).toEqual([])
})
test('revierte encabezado, detalles e historial si falla un producto posterior', async () => {
  const input = request({ items: [{ id: 900001, qty: 1 }, { id: 999999, qty: 1 }] })
  await expect(create(input)).rejects.toThrow(/disponible/)
  for (const table of ['pedidos', 'detalles_pedido', 'historial_estados_pedido']) {
    const key = table === 'pedidos' ? 'id' : 'pedido_id'
    expect((await db.query(`SELECT * FROM public.${table} WHERE ${key}=$1`, [input.id])).rows).toEqual([])
  }
})
test('registra el estado inicial y cada cambio real con actor y fecha', async () => {
  const input = request(); await create(input)
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [users[3]])
  try {
    await db.query("UPDATE public.pedidos SET estado='en_preparacion' WHERE id=$1", [input.id])
    await db.query("UPDATE public.pedidos SET estado='en_preparacion',notas='Una nota' WHERE id=$1", [input.id])
    await db.query("UPDATE public.pedidos SET estado='listo' WHERE id=$1", [input.id])
  } finally { await db.exec("SELECT set_config('request.jwt.claim.sub','',false)") }
  const rows = (await asUser(0, 'SELECT * FROM public.historial_estados_pedido WHERE pedido_id=$1 ORDER BY id', [input.id])).rows
  expect(rows).toHaveLength(3)
  expect(rows[0]).toMatchObject({ estado_anterior: null, estado: 'pendiente', cambiado_por: users[0] })
  expect(rows[1]).toMatchObject({ estado_anterior: 'pendiente', estado: 'en_preparacion', cambiado_por: users[3] })
  expect(rows.every(row => row.cambiado_en)).toBe(true)
})
test('RLS oculta pedidos, detalles e historial de otro cliente sin filtros del servicio', async () => {
  const input = request(); await create(input)
  for (const table of ['pedidos', 'detalles_pedido', 'historial_estados_pedido']) {
    expect((await asUser(1, `SELECT * FROM public.${table}`)).rows).toEqual([])
    const key = table === 'pedidos' ? 'id' : 'pedido_id'
    for (let i = 2; i < users.length; i++) expect((await asUser(i, `SELECT * FROM public.${table} WHERE ${key}=$1`, [input.id])).rows).toHaveLength(1)
    await expect(asUser(null, `SELECT * FROM public.${table}`)).rejects.toThrow(/permission denied/)
  }
})
test.each([null, 2, 3, 4, 5])('el rol %s no ejecuta la confirmación de cliente', async user => {
  await expect(create(request(), user)).rejects.toThrow(/permission denied|Solo clientes/)
})
test('los clientes no modifican importes, propietario, detalles, pagos ni auditoría por SQL directo', async () => {
  const input = request(); await create(input)
  for (const sql of [
    "UPDATE public.pedidos SET total=0", "UPDATE public.pedidos SET subtotal=0", "UPDATE public.pedidos SET estado='listo'",
    `UPDATE public.pedidos SET cliente_id='${users[1]}'`, 'DELETE FROM public.pedidos',
    "INSERT INTO public.pedidos(tipo,total,creado_por) VALUES ('recojo',0,auth.uid())",
    `INSERT INTO public.detalles_pedido(pedido_id,producto_id,cantidad,precio_unitario) VALUES ('${input.id}',900001,1,0)`,
    'UPDATE public.detalles_pedido SET precio_unitario=0', 'DELETE FROM public.detalles_pedido',
    `INSERT INTO public.historial_estados_pedido(pedido_id,estado) VALUES ('${input.id}','listo')`,
    "UPDATE public.historial_estados_pedido SET estado='listo'", 'DELETE FROM public.historial_estados_pedido',
    `INSERT INTO public.pagos(pedido_id,registrado_por,metodo,monto) VALUES ('${input.id}',auth.uid(),'efectivo',1)`,
  ]) await expect(asUser(0, sql)).rejects.toThrow(/permission denied/)
})
test('los futuros flujos de salón pueden mantener los importes mediante detalles autorizados', async () => {
  const id = randomUUID()
  const mesa = (await db.query('SELECT id FROM public.mesas LIMIT 1')).rows[0].id
  await db.query("INSERT INTO public.pedidos(id,tipo,mesa_id,creado_por,total) VALUES ($1,'salon',$2,$3,0)", [id, mesa, users[2]])
  const detail = (await db.query('INSERT INTO public.detalles_pedido(pedido_id,producto_id,cantidad,precio_unitario) VALUES ($1,900001,1,42.90) RETURNING id', [id])).rows[0].id
  await db.exec("UPDATE public.productos SET nombre='Nombre nuevo' WHERE id=900001")
  await db.query('UPDATE public.detalles_pedido SET cantidad=2 WHERE id=$1', [detail])
  expect(Number((await db.query('SELECT total FROM public.pedidos WHERE id=$1', [id])).rows[0].total)).toBe(85.8)
  expect((await db.query('SELECT nombre_producto FROM public.detalles_pedido WHERE id=$1', [detail])).rows[0].nombre_producto).toBe('Nombre vendido')
  await db.query('DELETE FROM public.detalles_pedido WHERE id=$1', [detail])
  const row = (await db.query('SELECT subtotal,envio,total FROM public.pedidos WHERE id=$1', [id])).rows[0]
  expect(Object.values(row).map(Number)).toEqual([0, 0, 0])
})
