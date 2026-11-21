import { afterAll, beforeAll, expect, test } from 'vitest'
import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { createLocalDatabase, asLocalUser, localUsers } from '../scripts/local-db.mjs'

let db, before
const client = localUsers.find(user => user.rol === 'cliente')
const asClient = work => asLocalUser(db, client, work)
const profile = (values, id = client.id) => asClient(tx => tx.query('UPDATE public.perfiles SET nombre=$1,apellido=$2,telefono=$3 WHERE id=$4 RETURNING nombre,apellido', [...values, id]))
const order = (delivery, items = [{ id: 1, qty: 1 }], id = randomUUID()) => asClient(tx => tx.query('SELECT public.crear_pedido_cliente($1,$2,$3,$4,$5) AS id', [id, 'delivery', items, delivery, 'efectivo']))
const valid = { name: 'Cliente Prueba', phone: '987654321', address: 'Av. Prueba 123', location: { lat: -11.88, lng: -77.03, address: 'Av. Prueba 123' } }

beforeAll(async () => {
  db = await createLocalDatabase(undefined, { inventory: true })
  // Reproducir los permisos amplios encontrados en el backend importado.
  await db.exec('GRANT ALL ON public.perfiles TO anon,authenticated')
  const legacy = randomUUID()
  await db.query('INSERT INTO auth.users(id,profile) VALUES($1,$2)', [legacy, { name: 'Legado123' }])
  before = (await db.query('SELECT id,nombre,apellido,telefono,rol,preferencias FROM public.perfiles ORDER BY id')).rows
  await db.exec(await readFile(new URL('../../migrations/validacion/20261120131000_validaciones-carrito-perfiles.sql', import.meta.url), 'utf8'))
}, 60000)
afterAll(async () => { await db?.close() })

test('los borradores se aplican sin corregir ni borrar datos históricos', async () => {
  expect((await db.query('SELECT id,nombre,apellido,telefono,rol,preferencias FROM public.perfiles ORDER BY id')).rows).toEqual(before)
})

test('el perfil propio no permite cambiar rol ni identidad aunque antes hubiera GRANT ALL', async () => {
  await expect(asClient(tx => tx.query("UPDATE public.perfiles SET rol='admin' WHERE id=$1", [client.id]))).rejects.toThrow(/permission denied/)
  await expect(asClient(tx => tx.query('UPDATE public.perfiles SET id=$1 WHERE id=$2', [randomUUID(), client.id]))).rejects.toThrow(/permission denied/)
  await expect(profile(['Cliente', 'Prueba', '987654321'], localUsers.find(user => user.rol === 'admin').id)).resolves.toMatchObject({ rows: [] })
})

test('el trigger protege el rol incluso si se vuelve a conceder UPDATE general por error', async () => {
  await db.exec('GRANT UPDATE ON public.perfiles TO authenticated')
  try {
    await expect(asClient(tx => tx.query("UPDATE public.perfiles SET rol='admin' WHERE id=$1", [client.id]))).rejects.toThrow(/No puedes modificar/)
  } finally {
    await db.exec('REVOKE UPDATE ON public.perfiles FROM authenticated')
    await db.exec('GRANT UPDATE(nombre,apellido,telefono,preferencias) ON public.perfiles TO authenticated')
  }
})

test.each(['123456', 'Ana9', '<script>', 'Ana\nPérez', 'a'.repeat(121)])('SQL rechaza el nombre inválido sin pasar por React: %s', async name => {
  await expect(profile([name, 'Prueba', '987654321'])).rejects.toThrow(/Nombre inválido/)
})

test('admite tildes, guiones y apóstrofes y permite las preferencias legítimas', async () => {
  expect((await profile(['María José', "O'Neill-Pérez", '987654321'])).rows[0]).toEqual({ nombre: 'María José', apellido: "O'Neill-Pérez" })
  await expect(asClient(tx => tx.query('UPDATE public.perfiles SET preferencias=$1 WHERE id=$2', [{ notificacionesEmail: false, notificacionesPromos: true }, client.id]))).resolves.toBeTruthy()
  await expect(asClient(tx => tx.query('UPDATE public.perfiles SET preferencias=$1 WHERE id=$2', [{ rol: 'admin' }, client.id]))).rejects.toThrow(/Preferencias inválidas/)
})

test('el alta que inserta el perfil rechaza nombres numéricos y revierte el usuario en la base local', async () => {
  const id = randomUUID()
  await expect(db.query('INSERT INTO auth.users(id,profile) VALUES($1,$2)', [id, { name: '123456' }])).rejects.toThrow(/Nombre inválido/)
  expect((await db.query('SELECT id FROM auth.users WHERE id=$1', [id])).rows).toEqual([])
})

test.each([{ name: 'Cliente123' }, { phone: 987654321 }, { address: {} }, { address: 'a'.repeat(151) }, { reference: 'x'.repeat(151) }, { location: { lat: 0, lng: 0, outOfZone: false } }])('la RPC bloquea los datos de entrega manipulados: %j', async changes => {
  const id = randomUUID()
  await expect(order({ ...valid, ...changes }, undefined, id)).rejects.toThrow()
  expect((await db.query('SELECT id FROM public.pedidos WHERE id=$1', [id])).rows).toEqual([])
})

test('conserva precios de servidor, inventario e idempotencia y no expone la función base', async () => {
  const id = randomUUID(), delivery = { ...valid, location: { lat: -11.88, lng: -77.03 } }
  await order(delivery, [{ id: 1, qty: 1, price: 0 }], id)
  const first = (await db.query('SELECT total FROM public.pedidos WHERE id=$1', [id])).rows[0]
  expect(Number(first.total)).toBeGreaterThan(0)
  expect((await order(delivery, undefined, id)).rows[0].id).toBe(id)
  expect((await db.query('SELECT id FROM public.detalles_pedido WHERE pedido_id=$1', [id])).rows).toHaveLength(1)
  await expect(asClient(tx => tx.query('SELECT public.crear_pedido_cliente_validacion_base($1,$2,$3,$4,$5)', [randomUUID(), 'recojo', [{ id: 1, qty: 1 }], valid, 'efectivo']))).rejects.toThrow(/permission denied/)
})

test('la RPC acepta dirección y referencia de exactamente 150 caracteres', async () => {
  const id = randomUUID(), reference = 'r'.repeat(150)
  await order({ ...valid, address: 'a'.repeat(150), reference }, undefined, id)
  expect((await db.query('SELECT destinatario FROM public.pedidos WHERE id=$1', [id])).rows[0].destinatario.reference).toBe(reference)
})


test.each([undefined, null, { lat: '-11.88', lng: '-77.03' }, { lat: -11.94, lng: -77.08, outOfZone: false }])('SQL no acepta delivery sin punto válido en el distrito: %j', async location => {
  await expect(order({ ...valid, location })).rejects.toThrow()
})

test('SQL y navegador usan el mismo límite distrital en una cuadrícula de puntos', async () => {
  const { isWithinCarabayllo } = await import('../src/utils/carabaylloLocation')
  const points = []
  for (let lat = -12; lat <= -11.6; lat += 0.04) for (let lng = -77.2; lng <= -76.8; lng += 0.04) points.push({ lat, lng })
  for (const point of points) {
    const result = await db.query('SELECT public.punto_en_carabayllo($1,$2) AS inside', [point.lat, point.lng])
    expect(result.rows[0].inside, JSON.stringify(point)).toBe(isWithinCarabayllo(point))
  }
})
