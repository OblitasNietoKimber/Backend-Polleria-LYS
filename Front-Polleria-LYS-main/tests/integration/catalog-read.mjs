import { readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
import { createClient } from '@insforge/sdk'
import { getConfigurationError, INSFORGE_PROJECT } from '../../src/lib/insforgeConfig.js'

const text = await readFile(new URL('../../.env.local', import.meta.url), 'utf8')
const env = Object.fromEntries(text.split(/\r?\n/).filter(line => line && !line.startsWith('#')).map(line => {
  const index = line.indexOf('=')
  return [line.slice(0, index), line.slice(index + 1)]
}))
const baseUrl = env.VITE_INSFORGE_BASE_URL
const anonKey = env.VITE_INSFORGE_ANON_KEY
const configurationError = getConfigurationError(baseUrl, anonKey)
assert.equal(configurationError, null, configurationError || undefined)
const client = createClient({ baseUrl, anonKey })

const categories = await client.database.from('categorias').select('id,nombre').order('id').range(0, 99)
assert.equal(categories.error, null, categories.error?.message)
assert.ok(categories.data.length > 0, 'El backend no tiene categorías iniciales')
const products = await client.database.from('productos')
  .select('id,categoria_id,nombre,descripcion,imagen,precio,disponible').order('id').range(0, 99)
assert.equal(products.error, null, products.error?.message)
assert.ok(products.data.length > 0, 'El backend no tiene productos iniciales')
const product = products.data[0]
const detail = await client.database.from('productos').select('id,nombre').eq('id', product.id).single()
assert.equal(detail.error, null, detail.error?.message)
assert.equal(detail.data.nombre, product.nombre)
const escapedName = product.nombre.replace(/[\\%_]/g, '\\$&')
const filtered = await client.database.from('productos').select('id').eq('categoria_id', product.categoria_id).ilike('nombre', `%${escapedName}%`)
assert.equal(filtered.error, null, filtered.error?.message)
assert.ok(filtered.data.some(row => Number(row.id) === Number(product.id)))
console.log(`${INSFORGE_PROJECT.name}: categorías, productos, detalle, búsqueda y filtro verificados con la clave pública. Solo lecturas; sin crear usuarios ni modificar datos.`)
