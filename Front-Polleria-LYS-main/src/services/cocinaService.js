import { requireInsforge } from '../lib/insforge';
import { getCurrentUser } from './authService';
export const ESTADOS_COCINA = { NUEVO: 'nuevo', EN_PREPARACION: 'en_preparacion', LISTO: 'listo' };
export const HISTORY_PAGE_SIZE = 50;
const states = { pendiente: 'nuevo', en_preparacion: 'en_preparacion', listo: 'listo', entregado: 'entregado' };
const backendStates = { nuevo: 'pendiente', en_preparacion: 'en_preparacion', listo: 'listo' };
const fields = 'id,tipo,estado,estado_pago,notas,creado_en,actualizado_en,mesas(numero),detalles_pedido(id,producto_id,cantidad,nombre_producto),historial_estados_pedido(id,estado,cambiado_por,cambiado_en,es_reconstruido)';
function database() {
  if (!['cocina','admin'].includes(getCurrentUser()?.rol)) throw new Error('Se requiere una cuenta de cocina o administrador.');
  return requireInsforge().database;
}
function unwrap({ data, error }) {
  if (error) throw new Error(error.message || 'No se pudo consultar cocina.');
  return data;
}
export function mapPedido(row) {
  const history = [...(row.historial_estados_pedido || [])].sort((a,b) => Number(b.id) - Number(a.id));
  const last = history[0], ready = history.find(item => item.estado === 'listo' && !item.es_reconstruido);
  return { id: row.id, tipo: row.tipo, mesa: row.mesas?.numero || null,
    cliente: row.mesas ? `Mesa ${row.mesas.numero}` : row.tipo === 'delivery' ? 'Delivery' : 'Recojo',
    estadoCocina: states[row.estado], backendStatus: row.estado, estadoPago: row.estado_pago,
    observaciones: row.notas || '', createdAt: row.creado_en,
    finalizadoAt: ready?.cambiado_en || (row.estado === 'entregado' && !last?.es_reconstruido ? last?.cambiado_en : null),
    cambiadoPor: last?.cambiado_por || null, cambiadoEn: last?.cambiado_en || null,
    esReconstruido: Boolean(last?.es_reconstruido),
    items: (row.detalles_pedido || []).map(item => ({ id: item.id, productoId: item.producto_id,
      nombre: item.nombre_producto, cantidad: Number(item.cantidad) })) };
}
async function getPedidosActivos() {
  const db = database(), result = [];
  for (let offset = 0; ; offset += 100) {
    const rows = unwrap(await db.from('pedidos').select(fields).in('estado',['pendiente','en_preparacion','listo'])
      .order('creado_en',{ascending:true}).order('id',{ascending:true}).range(offset,offset+99)) || [];
    result.push(...rows.filter(row => row.detalles_pedido?.length).map(mapPedido));
    if (rows.length < 100) return result;
  }
}
async function getPedidosFinalizados({ page = 0 } = {}) {
  if (!Number.isSafeInteger(page) || page < 0) throw new Error('Página inválida.');
  const rows = unwrap(await database().from('pedidos').select(fields).in('estado',['listo','entregado'])
    .order('actualizado_en',{ascending:false}).order('id',{ascending:false})
    .range(page*HISTORY_PAGE_SIZE,(page+1)*HISTORY_PAGE_SIZE-1)) || [];
  return rows.map(mapPedido);
}
async function cambiarEstado(pedido, nuevoEstado) {
  return unwrap(await database().rpc('cambiar_estado_cocina', { p_pedido_id: pedido.id,
    p_estado_actual: backendStates[pedido.estadoCocina], p_nuevo_estado: backendStates[nuevoEstado] }));
}
export default { getPedidosActivos, getPedidosFinalizados, cambiarEstado };
