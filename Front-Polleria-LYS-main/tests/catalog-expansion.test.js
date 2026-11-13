import { beforeAll, afterAll, expect, test } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFile, readdir } from 'node:fs/promises'

const db = new PGlite()
const directory = new URL('../../insforge/migrations/', import.meta.url)
const groups = JSON.parse(await readFile(new URL('fixtures/menu-carta.json', import.meta.url), 'utf8'))
let files, before
const apply = async file => db.exec(await readFile(new URL(file, directory), 'utf8'))
beforeAll(async () => {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY,profile jsonb NOT NULL DEFAULT '{}');
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA auth,public TO anon,authenticated;`)
  files = (await readdir(directory)).filter(f => f.endsWith('.sql')).sort()
  for (const file of files.filter(f => Number(f.slice(0, 3)) < 20)) await apply(file)
  before = (await db.query('SELECT * FROM productos ORDER BY id')).rows
  for (const file of files.filter(f => Number(f.slice(0, 3)) >= 20)) await apply(file)
}, 30000)
afterAll(() => db.close())

test.each(groups)('precios, categorías e imágenes de $slug coinciden con la carta', async group => {
  for (const entry of group.entries) {
    if (entry.priceOnlyIds) {
      for (const id of entry.priceOnlyIds) {
        const row = (await db.query('SELECT * FROM productos WHERE id=$1',[id])).rows[0]
        expect(Number(row.precio)).toBe(entry.price)
        const original = before.find(p => Number(p.id) === id)
        expect({ ...row, precio: original.precio }).toEqual(original)
      }
    } else {
      const rows = (await db.query('SELECT * FROM productos WHERE imagen=$1',[entry.image])).rows
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({ categoria_id: entry.category, nombre: entry.name, descripcion: entry.description })
      expect(Number(rows[0].precio)).toBe(entry.price)
    }
  }
})

test('conserva IDs, no altera los pollos actualizados y no añade gaseosas genéricas equivalentes', async () => {
  const rows = (await db.query('SELECT * FROM productos ORDER BY id')).rows
  expect(rows).toHaveLength(119)
  expect((await db.query('SELECT id FROM categorias')).rows).toHaveLength(13)
  for (const id of [1,2,3,4,11,12,18,19,20,21]) expect(rows.find(p => Number(p.id) === id)).toEqual(before.find(p => Number(p.id) === id))
  for (const [id, name] of [[5,'Alitas BBQ con papas fritas'],[7,'Anticuchos con papas'],[8,'Porción de papas fritas'],[9,'Porción de ensalada'],[10,'Porción de arroz chaufa'],[17,'Jarra de chicha morada']]) {
    expect(rows.find(p => Number(p.id) === id).nombre).toBe(name)
  }
  expect(rows.some(p => ['Gaseosa personal','Gaseosa de 1.5 L'].includes(p.nombre))).toBe(false)
})

test('reaplicar todas las secciones conserva registros e IDs sin duplicados', async () => {
  const original = (await db.query('SELECT * FROM productos ORDER BY id')).rows
  for (const file of files.filter(f => Number(f.slice(0, 3)) >= 20)) await apply(file)
  expect((await db.query('SELECT * FROM productos ORDER BY id')).rows).toEqual(original)
  expect((await db.query('SELECT lower(btrim(nombre)) FROM productos GROUP BY lower(btrim(nombre)) HAVING count(*)>1')).rows).toEqual([])
})
