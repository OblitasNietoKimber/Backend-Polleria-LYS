import { expect, test } from 'vitest'
import { getCartError, sanitizeStoredCart, validateCheckout } from '../src/utils/checkoutValidation'
const product = { id: 1, price: 20, stock: 5, available: true }
const valid = { items: [{ product, qty: 1 }], deliveryType: 'delivery', payment: 'efectivo', form: { name: 'Cliente Prueba', phone: '987654321', address: 'Av. Prueba 123', location: { lat: -11.88, lng: -77.03, address: 'Av. Prueba 123' } } }

test.each([-1, 0, 1.5, 101, '2', null, NaN, Infinity, {}])('rechaza la cantidad %j antes de confirmar', qty => {
  expect(getCartError([{ product, qty }])).toBeTruthy()
  expect(sanitizeStoredCart({ 1: qty })).toEqual({})
})

test.each([[], null, 'carrito', { '__proto__': 1 }, { 0: 1 }, { '1.5': 1 }, { 1: { qty: 2 } }])('el almacenamiento manipulado no forma un carrito válido: %j', value => {
  expect(sanitizeStoredCart(value)).toEqual({})
})

test('comprueba disponibilidad, precios finitos, duplicados y stock, incluidos recursos compartidos', () => {
  expect(validateCheckout(valid, { checkStock: true })).toEqual({})
  expect(getCartError([{ product, qty: 6 }], { checkStock: true })).toBeTruthy()
  expect(getCartError([{ product: { ...product, price: Infinity }, qty: 1 }], { checkStock: true })).toBeTruthy()
  expect(getCartError([...valid.items, ...valid.items])).toBeTruthy()
  expect(getCartError([{ product: { ...product, available: false }, qty: 1 }], { checkStock: true })).toBeTruthy()
  const whole = { ...product, inventoryId: 'pollo', inventoryScale: 8, inventoryAvailable: 1, inventoryConsumption: 8 }
  const half = { ...whole, id: 2, inventoryConsumption: 4 }
  expect(getCartError([{ product: whole, qty: 1 }, { product: half, qty: 1 }], { checkStock: true })).toBeTruthy()
})

test('un método o tipo de entrega inventado no pasa la confirmación', () => {
  expect(validateCheckout({ ...valid, payment: 'gratis' }).payment).toBeTruthy()
  expect(validateCheckout({ ...valid, deliveryType: 'sin-envío' }).deliveryType).toBeTruthy()
  expect(validateCheckout({ ...valid, form: { ...valid.form, name: 'Cliente123' } }).name).toBeTruthy()
})
