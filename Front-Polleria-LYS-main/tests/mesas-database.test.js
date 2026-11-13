import { beforeAll, afterAll, afterEach, expect, test } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFile, readdir } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'

const db = new PGlite()
const roles = ['cliente', 'mesera', 'cocina', 'caja', 'admin']
const users = roles.map((_, i) => `20000000-0000-0000-0000-${String(i + 1).padStart(12, '0')}`)
const directory = new URL('../../insforge/migrations/', import.meta.url)

async function asUser(index, sql, values = []) {
  await db.exec(`SET ROLE ${index === null ? 'anon' : 'authenticated'}; SELECT set_config('request.jwt.claim.sub','${index === null ? '' : users[index]}',false)`)
  try {
    return await db.query(sql, values)
  } finally {
    await db.exec("RESET ROLE; SELECT set_config('request.jwt.claim.sub','',false)")
  }
}

beforeAll(async () => {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY,profile jsonb NOT NULL DEFAULT '{}');
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA auth,public TO anon,authenticated;`)

  const files = (await readdir(directory)).filter(file => file.endsWith('.sql')).sort()
  for (const file of files) {
    const sql = await readFile(new URL(file, directory), 'utf8')
    await db.exec(sql.replace(/^BEGIN;\s*/, '').replace(/COMMIT;\s*$/, ''))
  }

  for (let i = 0; i < users.length; i++) {
    await db.query('INSERT INTO auth.users(id) VALUES ($1) ON CONFLICT DO NOTHING', [users[i]])
    await db.query('INSERT INTO public.perfiles(id,rol,nombre,apellido,telefono) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id) DO UPDATE SET rol=$2',
      [users[i], roles[i], `Usuario ${roles[i]}`, 'Prueba', '999888777'])
  }
  await db.exec(await readFile(new URL('../../migrations/20261016194047_caja-pagos.sql', import.meta.url), 'utf8'))
  // Precios controlados del escenario de negocio; independientes de la carta comercial.
  await db.exec("UPDATE productos SET precio = CASE id WHEN 1 THEN 42.90 WHEN 2 THEN 24.90 WHEN 3 THEN 14.90 END WHERE id IN (1,2,3)")
}, 30000)

afterAll(() => db.close())

afterEach(async () => {
  await db.exec('DELETE FROM public.detalles_pedido')
  await db.exec('DELETE FROM public.historial_estados_pedido')
  await db.exec('DELETE FROM public.pedidos')
  await db.exec("UPDATE public.mesas SET estado = 'libre'")
})

test('SCRUM-277: obtener_mesas_con_pedidos lista las 16 mesas de PostgreSQL', async () => {
  const res = await asUser(1, 'SELECT public.obtener_mesas_con_pedidos() AS data')
  const mesas = res.rows[0].data
  expect(mesas).toHaveLength(16)
  expect(mesas[0]).toMatchObject({
    numero: '01',
    capacidad: 2,
    estado: 'libre',
    pedido_id: null,
  })
})

test('SCRUM-278: mesera abre un pedido de salon y ocupa la mesa', async () => {
  const reqId = randomUUID()
  const res = await asUser(1, 'SELECT public.abrir_pedido_salon($1, 1, 4, $2, $3::jsonb) AS id', [
    reqId,
    'Mesa junto a la ventana',
    JSON.stringify([{ id: 1, qty: 2 }]),
  ])
  const pedidoId = res.rows[0].id
  expect(pedidoId).toBe(reqId)

  // Mesa pasa a ocupada
  const mesa = (await asUser(1, 'SELECT * FROM public.mesas WHERE id = 1')).rows[0]
  expect(mesa.estado).toBe('ocupada')

  // Pedido registrado con tipo salon y subtotal calculado por triggers
  const pedido = (await asUser(1, 'SELECT * FROM public.pedidos WHERE id = $1', [pedidoId])).rows[0]
  expect(pedido.tipo).toBe('salon')
  expect(pedido.estado).toBe('pendiente')
  expect(pedido.notas).toBe('Mesa junto a la ventana')
  expect(Number(pedido.subtotal)).toBe(85.8) // 2 * 42.90
  expect(Number(pedido.total)).toBe(85.8)

  // Historial auditado automáticamente
  const historial = (await asUser(1, 'SELECT * FROM public.historial_estados_pedido WHERE pedido_id = $1', [pedidoId])).rows
  expect(historial).toHaveLength(1)
  expect(historial[0].estado).toBe('pendiente')
  expect(historial[0].cambiado_por).toBe(users[1])
})

test('SCRUM-278: clientes o roles no autorizados no pueden abrir pedidos de salon', async () => {
  await expect(asUser(0, 'SELECT public.abrir_pedido_salon($1, 1, 2, $2, $3::jsonb)', [
    randomUUID(),
    'Intento cliente',
    '[]',
  ])).rejects.toThrow('Solo meseras o administradores pueden abrir pedidos de salón')

  await expect(asUser(2, 'SELECT public.abrir_pedido_salon($1, 1, 2, $2, $3::jsonb)', [
    randomUUID(),
    'Intento cocina',
    '[]',
  ])).rejects.toThrow('Solo meseras o administradores pueden abrir pedidos de salón')
})

test('SCRUM-282: impide dos pedidos activos simultáneos en la misma mesa', async () => {
  const pedido1 = randomUUID()
  await asUser(1, 'SELECT public.abrir_pedido_salon($1, 2, 4, $2, $3::jsonb)', [pedido1, '', '[]'])

  const pedido2 = randomUUID()
  await expect(asUser(1, 'SELECT public.abrir_pedido_salon($1, 2, 4, $2, $3::jsonb)', [
    pedido2,
    '',
    '[]',
  ])).rejects.toThrow('La mesa ya tiene un pedido activo')
})

test('SCRUM-279: permite agregar productos y observaciones a un pedido abierto', async () => {
  const pedidoId = randomUUID()
  await asUser(1, 'SELECT public.abrir_pedido_salon($1, 3, 4, $2, $3::jsonb)', [pedidoId, 'Sin cebolla', '[]'])

  // Actualizar detalles y observaciones
  await asUser(1, 'SELECT public.agregar_o_modificar_detalles_salon($1, $2::jsonb, $3)', [
    pedidoId,
    JSON.stringify([
      { id: 1, qty: 1 }, // 42.90
      { id: 13, qty: 2 }, // 2 * 10.00 = 20.00, precio de la carta actual
    ]),
    'Sin cebolla y cremas aparte',
  ])

  const pedido = (await asUser(1, 'SELECT * FROM public.pedidos WHERE id = $1', [pedidoId])).rows[0]
  expect(pedido.notas).toBe('Sin cebolla y cremas aparte')
  expect(Number(pedido.subtotal)).toBe(62.90)
  expect(Number(pedido.total)).toBe(62.90)

  // Consultar sincronización con mesas
  const mesas = (await asUser(1, 'SELECT public.obtener_mesas_con_pedidos() AS data')).rows[0].data
  const mesa3 = mesas.find((m) => m.numero === '03')
  expect(mesa3.estado).toBe('ocupada')
  expect(mesa3.items).toHaveLength(2)
})

test('SCRUM-280: registra el envío del pedido a cocina y audita el cambio en el historial', async () => {
  const pedidoId = randomUUID()
  await asUser(1, 'SELECT public.abrir_pedido_salon($1, 4, 4, $2, $3::jsonb)', [
    pedidoId,
    '',
    JSON.stringify([{ id: 1, qty: 1 }]),
  ])

  // Enviar a cocina
  await asUser(1, 'SELECT public.enviar_pedido_cocina($1)', [pedidoId])

  const pedido = (await asUser(1, 'SELECT * FROM public.pedidos WHERE id = $1', [pedidoId])).rows[0]
  expect(pedido.estado).toBe('en_preparacion')

  // Verificar historial de transiciones
  const historial = (await asUser(1, 'SELECT * FROM public.historial_estados_pedido WHERE pedido_id = $1 ORDER BY id', [pedidoId])).rows
  expect(historial).toHaveLength(2)
  expect(historial[0].estado).toBe('pendiente')
  expect(historial[1].estado_anterior).toBe('pendiente')
  expect(historial[1].estado).toBe('en_preparacion')
  expect(historial[1].cambiado_por).toBe(users[1])
})

test('SCRUM-281: registra la solicitud de cuenta para caja', async () => {
  const pedidoId = randomUUID()
  await asUser(1, 'SELECT public.abrir_pedido_salon($1, 5, 2, $2, $3::jsonb)', [
    pedidoId,
    '',
    JSON.stringify([{ id: 2, qty: 1 }]),
  ])

  await asUser(1, 'SELECT public.solicitar_cuenta_salon($1)', [pedidoId])

  const pedido = (await asUser(1, 'SELECT * FROM public.pedidos WHERE id = $1', [pedidoId])).rows[0]
  expect(pedido.cuenta_solicitada).toBe(true)

  const mesas = (await asUser(1, 'SELECT public.obtener_mesas_con_pedidos() AS data')).rows[0].data
  const mesa5 = mesas.find((m) => m.numero === '05')
  expect(mesa5.cuenta_solicitada).toBe(true)
})

test('liberar_mesa_salon desocupa la mesa', async () => {
  const pedidoId = randomUUID()
  await asUser(1, 'SELECT public.abrir_pedido_salon($1, 6, 2, $2, $3::jsonb)', [pedidoId, '', '[]'])

  let mesa = (await asUser(1, 'SELECT * FROM public.mesas WHERE id = 6')).rows[0]
  expect(mesa.estado).toBe('ocupada')

  await asUser(1, 'SELECT public.liberar_mesa_salon(6)')

  mesa = (await asUser(1, 'SELECT * FROM public.mesas WHERE id = 6')).rows[0]
  expect(mesa.estado).toBe('libre')
})

test('reservar_mesa_salon registra la reserva en PostgreSQL y se refleja en obtener_mesas_con_pedidos', async () => {
  await asUser(1, 'SELECT public.reservar_mesa_salon(8, $1, $2, $3, 4)', ['Familia Gómez', '21:00', '987654321'])

  const mesas = (await asUser(1, 'SELECT public.obtener_mesas_con_pedidos() AS data')).rows[0].data
  const mesa8 = mesas.find((m) => m.numero === '08')
  expect(mesa8.estado).toBe('reservada')
  expect(mesa8.cliente_reserva).toBe('Familia Gómez')
  expect(mesa8.hora_reserva).toBe('21:00')

  // Liberar mesa limpia la reserva
  await asUser(1, 'SELECT public.liberar_mesa_salon(8)')
  const mesasLibres = (await asUser(1, 'SELECT public.obtener_mesas_con_pedidos() AS data')).rows[0].data
  const mesa8Libre = mesasLibres.find((m) => m.numero === '08')
  expect(mesa8Libre.estado).toBe('libre')
  expect(mesa8Libre.cliente_reserva).toBeNull()
})

test('obtener_actividad_salon devuelve los eventos reales del historial de pedidos', async () => {
  const pedidoId = randomUUID()
  await asUser(1, 'SELECT public.abrir_pedido_salon($1, 9, 2, $2, $3::jsonb)', [pedidoId, '', '[]'])

  const acts = (await asUser(1, 'SELECT public.obtener_actividad_salon() AS data')).rows[0].data
  expect(Array.isArray(acts)).toBe(true)
  expect(acts.length).toBeGreaterThan(0)
  expect(acts[0]).toMatchObject({
    mesaNumero: '09',
    tipo: 'pedido_creado',
  })
})
