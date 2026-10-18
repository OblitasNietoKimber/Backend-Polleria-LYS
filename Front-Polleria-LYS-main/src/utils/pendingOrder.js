const KEY = 'lys-pending-order'
export function orderSignature(userId, { items, deliveryType, form, payment }) {
  return JSON.stringify({ userId, deliveryType, payment, form,
    items: items.map(({ product, qty }) => [product.id, qty]).sort((a, b) => Number(a[0]) - Number(b[0])) })
}
export function readPendingOrder() {
  try {
    const pending = JSON.parse(localStorage.getItem(KEY) || 'null')
    return typeof pending?.id === 'string' && typeof pending?.signature === 'string' ? pending : null
  } catch { return null }
}
export function savePendingOrder(pending) {
  try { localStorage.setItem(KEY, JSON.stringify(pending)) } catch { /* El reintento sigue disponible en memoria. */ }
}
export function clearPendingOrder() {
  try { localStorage.removeItem(KEY) } catch { /* Puede no estar disponible en modo privado. */ }
}
