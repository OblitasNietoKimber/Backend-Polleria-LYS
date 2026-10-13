import { requireInsforge } from '../lib/insforge'
import { getCurrentUser } from './authService'

export const ORDER_STATUS_STEPS = [
  { key: 'recibido', label: 'Recibido' },
  { key: 'preparacion', label: 'En preparación' },
  { key: 'listo', label: 'Listo' },
  { key: 'camino', label: 'En camino' },
  { key: 'entregado', label: 'Entregado' },
]

function mapOrder(row) {
  const items = (row.detalles_pedido || []).map(item => ({ id: item.producto_id, name: item.productos?.nombre || 'Producto', price: Number(item.precio_unitario), qty: item.cantidad }));
  return { id: row.id, items, subtotal: Number(row.total)-Number(row.envio), shipping: Number(row.envio), total: Number(row.total), deliveryType: row.tipo,
    form: row.destinatario || {}, payment: row.metodo_solicitado || 'Pendiente', createdAt: row.creado_en, backendStatus: row.estado };
}
const selection = '*, detalles_pedido(producto_id,cantidad,precio_unitario,productos(nombre))';
async function getOrders() {
  const user = getCurrentUser();
  if (!user) throw new Error('Debes iniciar sesión.');
  const { data, error } = await requireInsforge().database.from('pedidos').select(selection).eq('cliente_id', user.id).order('creado_en', { ascending: false });
  if (error) throw new Error(error.message);
  return data.map(mapOrder);
}
async function getOrderById(id) {
  const user = getCurrentUser();
  if (!user) throw new Error('Debes iniciar sesión.');
  const { data, error } = await requireInsforge().database.from('pedidos').select(selection).eq('id',id).eq('cliente_id', user.id).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapOrder(data) : null;
}
async function createOrder({ id, items, deliveryType, form, payment }) {
  const { data, error } = await requireInsforge().database.rpc('crear_pedido_cliente', {
    solicitud_id: id, tipo_entrega: deliveryType, articulos: items.map(({ product, qty }) => ({ id: product.id, qty })), datos_entrega: form, metodo: payment,
  });
  if (error) throw new Error(error.message);
  return data;
}

function getOrderStatus(order) {
  return ({ pendiente: 'recibido', en_preparacion: 'preparacion', listo: 'listo', entregado: 'entregado', cancelado: 'cancelado' })[order.backendStatus] || 'recibido'
}

export default {
  getOrders,
  getOrderById,
  createOrder,
  getOrderStatus,
}