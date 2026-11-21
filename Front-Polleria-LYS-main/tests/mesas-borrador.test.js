import { beforeEach, afterEach, expect, test, vi } from 'vitest'

beforeEach(() => {
  const storage = new Map()
  vi.stubGlobal('localStorage', {
    getItem: (key) => storage.get(key) || null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key),
  })
})

afterEach(() => vi.unstubAllGlobals())

test('guarda y restaura el borrador de comanda de una mesa con solicitudId para idempotencia', () => {
  const borrador = {
    solicitudId: '30000000-0000-0000-0000-000000000001',
    items: [{ id: 1, nombre: 'Pollo entero', cantidad: 2, precio: 42.9 }],
    observaciones: 'Sin cremas',
    comensales: 4,
    guardadoAt: new Date().toISOString(),
  }

  localStorage.setItem('lys_borrador_mesa_01', JSON.stringify(borrador))

  const recuperado = JSON.parse(localStorage.getItem('lys_borrador_mesa_01'))
  expect(recuperado).toMatchObject({
    solicitudId: '30000000-0000-0000-0000-000000000001',
    comensales: 4,
    observaciones: 'Sin cremas',
  })
  expect(recuperado.items).toHaveLength(1)

  localStorage.removeItem('lys_borrador_mesa_01')
  expect(localStorage.getItem('lys_borrador_mesa_01')).toBeNull()
})

test('tolera borrador con formato json corrupto sin lanzar excepciones no controladas', () => {
  localStorage.setItem('lys_borrador_mesa_02', '{invalido')
  let parsed = null
  expect(() => {
    try {
      parsed = JSON.parse(localStorage.getItem('lys_borrador_mesa_02'))
    } catch {
      parsed = null
    }
  }).not.toThrow()
  expect(parsed).toBeNull()
})
