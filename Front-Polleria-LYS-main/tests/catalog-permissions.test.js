import { beforeAll, afterAll, expect, test } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFile, readdir } from 'node:fs/promises'

const db = new PGlite()
const roles = ['cliente', 'mesera', 'cocina', 'caja', 'admin']
const ids = roles.map((_, i) => `00000000-0000-0000-0000-${String(i + 1).padStart(12, '0')}`)

async function asRole(role, sql) {
  const id = ids[roles.indexOf(role)] || ''
  await db.exec(`SET ROLE ${role === 'anon' ? 'anon' : 'authenticated'}; SELECT set_config('request.jwt.claim.sub','${id}',false);`)
  try { return await db.query(sql) }
  finally { await db.exec('RESET ROLE') }
}

beforeAll(async () => {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
    CREATE TABLE auth.users (id uuid PRIMARY KEY, profile jsonb NOT NULL DEFAULT '{}');
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA auth, public TO authenticated, anon;`)
  const directory = new URL('../../insforge/migrations/', import.meta.url)
  for (const name of (await readdir(directory)).filter(name => name.endsWith('.sql')).sort()) {
    await db.exec(await readFile(new URL(name, directory), 'utf8'))
  }
  for (const [index, role] of roles.entries()) {
    await db.query('INSERT INTO auth.users VALUES ($1)', [ids[index]])
    await db.query('UPDATE perfiles SET rol=$2 WHERE id=$1', [ids[index], role])
  }
}, 30000)

afterAll(() => db.close())

test('el visitante consulta las categorías y todos los campos de productos', async () => {
  expect((await asRole('anon', 'SELECT id,nombre,descripcion,imagen FROM categorias')).rows).toHaveLength(13)
  expect((await asRole('anon', 'SELECT id,categoria_id,nombre,descripcion,imagen,precio,disponible FROM productos')).rows).toHaveLength(119)
})

test('el visitante no crea ni edita productos mediante SQL directo', async () => {
  await expect(asRole('anon', "INSERT INTO productos(categoria_id,nombre,precio) VALUES ('pollos','Ataque',1)")).rejects.toThrow(/permission denied/)
  await expect(asRole('anon', 'UPDATE productos SET precio=0 WHERE id=1')).rejects.toThrow(/permission denied/)
})

test.each(roles.filter(role => role !== 'admin'))('%s no crea ni edita productos aunque omita el servicio React', async role => {
  const before = (await db.query('SELECT nombre,precio FROM productos WHERE id=1')).rows
  await expect(asRole(role, "INSERT INTO productos(categoria_id,nombre,precio) VALUES ('pollos','Ataque',1)")).rejects.toThrow(/row-level security/)
  expect((await asRole(role, "UPDATE productos SET nombre='Ataque',precio=0 WHERE id=1 RETURNING id")).rows).toEqual([])
  expect((await db.query('SELECT nombre,precio FROM productos WHERE id=1')).rows).toEqual(before)
})

test('el Administrador crea y edita un producto con todos sus campos', async () => {
  const created = await asRole('admin', `INSERT INTO productos(categoria_id,nombre,descripcion,imagen,precio,disponible)
    VALUES ('pollos','Nuevo','Descripción','https://example.com/plato.png',24.50,false) RETURNING *`)
  const product = created.rows[0]
  expect(Number(product.id)).toBeGreaterThan(17)
  expect(product).toMatchObject({ nombre: 'Nuevo', descripcion: 'Descripción', imagen: 'https://example.com/plato.png', disponible: false })
  expect((await asRole('anon', `SELECT disponible FROM productos WHERE id=${product.id}`)).rows).toEqual([{ disponible: false }])
  const edited = await asRole('admin', `UPDATE productos SET nombre='Editado',precio=25.50,disponible=true WHERE id=${product.id} RETURNING nombre,precio,disponible`)
  expect(edited.rows[0]).toMatchObject({ nombre: 'Editado', disponible: true })
  expect(Number(edited.rows[0].precio)).toBe(25.5)
})

test('ni un rol ausente ni la modificación del propio perfil permiten escribir', async () => {
  await expect(asRole('sin-perfil', "INSERT INTO productos(categoria_id,nombre,precio) VALUES ('pollos','Ataque',1)")).rejects.toThrow(/row-level security/)
  await expect(asRole('cliente', "UPDATE perfiles SET rol='admin' WHERE id=auth.uid()")).rejects.toThrow(/permission denied/)
})

test('las restricciones de precio y categoría también se aplican al Administrador', async () => {
  await expect(asRole('admin', "INSERT INTO productos(categoria_id,nombre,precio) VALUES ('pollos','Inválido',-1)")).rejects.toThrow(/check constraint/)
  await expect(asRole('admin', "INSERT INTO productos(categoria_id,nombre,precio) VALUES ('no-existe','Inválido',1)")).rejects.toThrow(/foreign key/)
})

test('la migración de identidad conserva los IDs y admite una base que ya tiene identidad', async () => {
  const before = (await db.query('SELECT id,nombre FROM productos ORDER BY id')).rows
  await db.exec(await readFile(new URL('../../insforge/migrations/008_productos_identidad.sql', import.meta.url), 'utf8'))
  expect((await db.query('SELECT id,nombre FROM productos ORDER BY id')).rows).toEqual(before)
  const created = await asRole('admin', "INSERT INTO productos(categoria_id,nombre,precio) VALUES ('pollos','Segundo',1) RETURNING id")
  expect(Number(created.rows[0].id)).toBeGreaterThan(Number(before.at(-1).id))
})
