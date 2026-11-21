import { asForm } from './identityValidation'
import { validateDeliveryForm } from './deliveryValidation'
import { stockLimit } from './stock'

export const MAX_CART_LINES = 100
export const MAX_ITEM_QUANTITY = 100
export const PAYMENT_METHODS = ['efectivo', 'yape', 'plin', 'tarjeta']

export const isProductId = value => (typeof value === 'number' || typeof value === 'string') &&
  /^[1-9][0-9]*$/.test(String(value)) && Number.isSafeInteger(Number(value))
export const isCartQuantity = value => typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= MAX_ITEM_QUANTITY

export function sanitizeStoredCart(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const entries = Object.entries(value)
  if (entries.length > MAX_CART_LINES || entries.some(([id, qty]) => !isProductId(id) || !isCartQuantity(qty))) return {}
  return Object.fromEntries(entries)
}

export function getCartError(items, { checkStock = false } = {}) {
  if (!Array.isArray(items) || items.length < 1 || items.length > MAX_CART_LINES) return 'El carrito debe contener entre 1 y 100 productos.'
  const ids = new Set()
  for (const item of items) {
    if (!item || !isProductId(item.product?.id)) return 'Hay un producto inválido en el carrito.'
    if (!isCartQuantity(item.qty)) return 'La cantidad debe ser un número entero entre 1 y 100.'
    const id = String(item.product.id)
    if (ids.has(id)) return 'No repitas un producto en el carrito.'
    ids.add(id)
    if (checkStock && (item.product.available !== true || !Number.isFinite(item.product.price) || item.product.price < 0)) {
      return 'Revisa el precio y la disponibilidad de los productos del carrito.'
    }
  }
  if (checkStock) {
    const quantities = Object.fromEntries(items.map(item => [item.product.id, item.qty]))
    const catalog = items.map(item => item.product)
    if (items.some(item => {
      const limit = stockLimit(item.product, quantities, catalog)
      return !Number.isFinite(limit) || item.qty > limit
    })) return 'El carrito supera el stock disponible. Revisa las cantidades.'
  }
  return null
}

export function validateCheckout(request, options) {
  request = asForm(request)
  const errors = validateDeliveryForm(request.form, request.deliveryType)
  const cartError = getCartError(request.items, options)
  if (cartError) errors.items = cartError
  if (!PAYMENT_METHODS.includes(request.payment)) errors.payment = 'Selecciona un método de pago válido.'
  return errors
}
