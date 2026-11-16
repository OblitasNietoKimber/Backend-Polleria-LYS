import { requireInsforge } from '../lib/insforge'
import { getCurrentUser } from './authService'

export const ORDER_PAGE_SIZE = 20
export const ORDER_STATUS_STEPS = [
  { key: 'recibido', label: 'Recibido' },
  { key: 'preparacion', label: 'En preparación' },
  { key: 'listo', label: 'Listo' },
  { key: 'camino', label: 'En camino' },
  { key: 'entregado', label: 'Entregado' },
]
const STATUS = { pendiente: 'recibido', en_preparacion: 'preparacion', listo: 'listo', en_camino: 'camino', entregado: 'entregado', cancelado: 'cancelado' }
export function getStatusLabel(estado) {
  const key = STATUS[estado]
  return ORDER_STATUS_STEPS.find(step => step.key === key)?.label || (key === 'cancelado' ? 'Cancelado' : estado)
}
function unwrap({ data, error }) {
  if (error) throw new Error(error.message || 'No se pudo consultar el pedido.')
  return data
}
function client() {
  const user = getCurrentUser()
  if (!user) throw new Error('Debes iniciar sesión.')
  if (user.rol !== 'cliente') throw new Error('Esta consulta requiere una cuenta de cliente.')
  return { db: requireInsforge().database, user }
}
function mapOrder(row) {
  return {
    id: row.id,
    items: (row.detalles_pedido || []).map(item => ({ id: item.producto_id,
      name: item.nombre_producto, price: Number(item.precio_unitario), qty: item.cantidad })),
    subtotal: Number(row.subtotal), shipping: Number(row.envio), total: Number(row.total),
    deliveryType: row.tipo, form: row.destinatario || {}, payment: row.metodo_solicitado || 'Pendiente',
    createdAt: row.creado_en, backendStatus: row.estado,
  }
}
const selection = 'id,subtotal,envio,total,tipo,destinatario,metodo_solicitado,creado_en,estado,detalles_pedido(producto_id,cantidad,precio_unitario,nombre_producto)'
async function getOrders({ page = 0 } = {}) {
  if (!Number.isSafeInteger(page) || page < 0) throw new Error('Página inválida.')
  const { db, user } = client()
  return (unwrap(await db.from('pedidos').select(selection).eq('cliente_id', user.id)
    .order('creado_en', { ascending: false }).order('id', { ascending: false })
    .range(page * ORDER_PAGE_SIZE, (page + 1) * ORDER_PAGE_SIZE - 1)) || []).map(mapOrder)
}
async function getOrderById(id) {
  const { db, user } = client()
  const row = unwrap(await db.from('pedidos').select(selection).eq('id', id).eq('cliente_id', user.id).maybeSingle())
  return row ? mapOrder(row) : null
}
async function getOrderState(id) {
  const { db, user } = client()
  return unwrap(await db.from('pedidos').select('estado').eq('id', id).eq('cliente_id', user.id).maybeSingle())
}
async function getOrderHistory(id, { before } = {}) {
  const { db } = client()
  // La política del historial comprueba la visibilidad del pedido incluso sin filtros del navegador.
  let query = db.from('historial_estados_pedido')
    .select('id,estado_anterior,estado,cambiado_en,es_reconstruido').eq('pedido_id', id)
  if (before) query = query.lt('id', before)
  return unwrap(await query.order('id', { ascending: false }).limit(50)) || []
}
async function createOrder({ id, items, deliveryType, form, payment, cardReceipt = null }) {
  const { db } = client()
  const tipoEntrega = deliveryType === 'pickup' ? 'recojo' : deliveryType
  const articulos = items.map(({ product, qty }) => ({ id: product.id, qty }))
  let savedId
  if (payment === 'tarjeta') {
    if (!cardReceipt?.success || cardReceipt.status !== 'succeeded') {
      throw new Error('Confirma el pago con tarjeta antes de crear el pedido.')
    }
    savedId = unwrap(await db.rpc('crear_pedido_cliente_tarjeta', {
      solicitud_id: id, tipo_entrega: tipoEntrega, articulos, datos_entrega: form,
      referencia_pago: cardReceipt.paymentIntentId || cardReceipt.authCode,
      idempotencia_pago: id,
    }))
  } else {
    savedId = unwrap(await db.rpc('crear_pedido_cliente', {
      solicitud_id: id, tipo_entrega: tipoEntrega, articulos, datos_entrega: form, metodo: payment,
    }))
  }
  const saved = await getOrderById(savedId)
  if (!saved) throw new Error('No se pudo consultar el pedido confirmado. Reintenta con la misma solicitud.')
  return saved
}
function getOrderStatus(order) { return STATUS[order.backendStatus] || 'recibido' }
export async function getActiveUnpaidOrder() {
  try {
    const { db, user } = client()
    const query = db
      .from('pedidos')
      .select('id,estado,estado_pago,metodo_solicitado,tipo,creado_en')
      .eq('cliente_id', user.id)
      .neq('estado', 'cancelado')
      .eq('estado_pago', 'pendiente')
      .in('metodo_solicitado', ['efectivo', 'yape', 'plin'])
      .order('creado_en', { ascending: false })
      .limit(1)

    const res = await query
    const rows = res?.data || []
    if (!rows.length) return null

    const row = rows[0]
    return {
      id: row.id,
      backendStatus: row.estado,
      estadoPago: row.estado_pago,
      payment: row.metodo_solicitado,
      tipo: row.tipo,
      createdAt: row.creado_en,
    }
  } catch {
    return null
  }
}

export default { getOrders, getOrderById, getOrderState, getOrderHistory, createOrder, getOrderStatus, getActiveUnpaidOrder }
