import { beforeAll, afterAll, expect, test } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFile, readdir } from 'node:fs/promises'

const db = new PGlite()
const directory = new URL('../../insforge/migrations/', import.meta.url)
const updates = ['017_actualizar_pollos_carta.sql', '018_pollo_anticucho_chorizo.sql', '019_ofertas_pollos.sql']
let originalProducts
const apply = async name => db.exec(await readFile(new URL(name, directory), 'utf8'))

beforeAll(async () => {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY, profile jsonb NOT NULL DEFAULT '{}');
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA auth,public TO anon,authenticated;`)
  for (const name of (await readdir(directory)).filter(name => name.endsWith('.sql') && Number(name.slice(0, 3)) < 17).sort()) await apply(name)
  originalProducts = (await db.query('SELECT * FROM productos ORDER BY id')).rows
  for (const name of updates) await apply(name)
}, 30000)
afterAll(() => db.close())

test('actualiza los tres pollos conservando sus IDs y agrega solo cuatro productos', async () => {
  const rows = (await db.query('SELECT * FROM productos ORDER BY id')).rows
  expect(rows).toHaveLength(21)
  expect(rows.slice(3, 17)).toEqual(originalProducts.slice(3))
  expect(rows.slice(0, 3).map(row => ({ id: Number(row.id), nombre: row.nombre, precio: Number(row.precio) }))).toEqual([
    { id: 1, nombre: 'Pollo a la brasa entero', precio: 56 },
    { id: 2, nombre: '1/2 Pollo a la brasa', precio: 29 },
    { id: 3, nombre: '1/4 Pollo a la brasa', precio: 16 },
  ])
})

test('usa los siete archivos indicados, precios de la página 1 y la categoría pollos', async () => {
  const rows = (await db.query("SELECT * FROM productos WHERE imagen LIKE 'https://res.cloudinary.com/y08rn1qr/image/upload/v1792377256/%'")).rows
  expect(rows).toHaveLength(7)
  const expected = { Cuarto_de_pollo: 16, Cuarto_de_pollo_con_anticucho_y_chorizo: 20, Medio_pollo: 29, Pollo_entero: 56, Oferta: 61, Oferton: 66, Super_oferton: 76 }
  for (const row of rows) {
    const file = new URL(row.imagen).pathname.split('/').at(-1).replace('.png', '')
    expect(Number(row.precio)).toBe(expected[file])
    expect(row.categoria_id).toBe('pollos')
    expect(row.disponible).toBe(true)
    expect(row.descripcion).toContain('papas fritas')
    expect(row.descripcion).toContain('ensalada fresca')
  }
  const offers = rows.filter(row => ['Oferta', 'Ofertón', 'Súper Ofertón'].includes(row.nombre))
  expect(offers).toHaveLength(3)
  expect(offers.every(row => row.descripcion.includes('1.5 L'))).toBe(true)
})

test('repetir las migraciones no duplica productos ni cambia sus IDs', async () => {
  const before = (await db.query('SELECT * FROM productos ORDER BY id')).rows
  for (const name of updates) await apply(name)
  expect((await db.query('SELECT * FROM productos ORDER BY id')).rows).toEqual(before)
})

test('reutiliza nombres equivalentes sin reactivar productos agotados', async () => {
  const combo = (await db.query("UPDATE productos SET nombre='Cuarto de pollo con anticucho y chorizo',imagen=NULL,disponible=false WHERE nombre='1/4 Pollo a la brasa con anticucho y chorizo' RETURNING id")).rows[0]
  const offer = (await db.query("UPDATE productos SET nombre=' OFERTON ',imagen=NULL WHERE nombre='Ofertón' RETURNING id")).rows[0]
  await apply(updates[1])
  await apply(updates[2])
  expect((await db.query('SELECT id,disponible FROM productos WHERE id=$1', [combo.id])).rows[0]).toEqual({ id: combo.id, disponible: false })
  expect((await db.query('SELECT id,nombre FROM productos WHERE id=$1', [offer.id])).rows[0]).toEqual({ id: offer.id, nombre: 'Ofertón' })
  expect((await db.query('SELECT count(*)::int AS n FROM productos')).rows[0].n).toBe(21)
})

test('si ya hay duplicados ambiguos, detiene la migración sin borrar productos', async () => {
  await db.exec("INSERT INTO productos(categoria_id,nombre,precio) VALUES ('pollos','oferton',1)")
  const before = (await db.query('SELECT * FROM productos ORDER BY id')).rows
  await expect(apply(updates[2])).rejects.toThrow('Hay más de un producto equivalente')
  await db.exec('ROLLBACK')
  expect((await db.query('SELECT * FROM productos ORDER BY id')).rows).toEqual(before)
})
