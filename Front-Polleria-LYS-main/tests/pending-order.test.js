import { beforeEach, afterEach, expect, test, vi } from 'vitest'
import { orderSignature, readPendingOrder, savePendingOrder, clearPendingOrder } from '../src/utils/pendingOrder'
const request = { items: [{ product: { id: 2 }, qty: 1 }, { product: { id: 1 }, qty: 2 }],
  deliveryType: 'delivery', form: { name: 'Cliente', phone: '987654321', address: 'Av. Prueba 123' }, payment: 'efectivo' }
beforeEach(() => {
  const storage = new Map()
  vi.stubGlobal('localStorage', { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) })
})
afterEach(() => vi.unstubAllGlobals())
test('reordenar el carrito no cambia la firma; cuenta y contenido sí la cambian', () => {
  const signature = orderSignature('cliente-a', request)
  expect(orderSignature('cliente-a', { ...request, items: [...request.items].reverse() })).toBe(signature)
  for (const [user, changes] of [['cliente-b', {}], ['cliente-a', { payment: 'yape' }], ['cliente-a', { deliveryType: 'recojo' }],
    ['cliente-a', { form: { ...request.form, address: 'Otra dirección' } }], ['cliente-a', { items: [{ product: { id: 1 }, qty: 3 }] }]]) {
    expect(orderSignature(user, { ...request, ...changes })).not.toBe(signature)
  }
})
test('recupera la solicitud pendiente y la elimina al terminar', () => {
  expect(readPendingOrder()).toBeNull()
  const pending = { id: 'uuid', signature: orderSignature('cliente-a', request) }
  savePendingOrder(pending); expect(readPendingOrder()).toEqual(pending)
  clearPendingOrder(); expect(readPendingOrder()).toBeNull()
})
test('tolera almacenamiento dañado o bloqueado', () => {
  localStorage.setItem('lys-pending-order', '{')
  expect(readPendingOrder()).toBeNull()
  vi.stubGlobal('localStorage', { getItem: () => { throw Error('bloqueado') }, setItem: () => { throw Error('bloqueado') }, removeItem: () => { throw Error('bloqueado') } })
  expect(readPendingOrder()).toBeNull()
  expect(() => savePendingOrder({})).not.toThrow()
  expect(() => clearPendingOrder()).not.toThrow()
})
