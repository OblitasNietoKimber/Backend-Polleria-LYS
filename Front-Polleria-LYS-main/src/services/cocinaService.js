import { requireInsforge } from '../lib/insforge';
import { getCurrentUser } from './authService';
import {FLOW_PREVIEW,getFlow,operateFlow,pendingKitchen} from './atencionService';
export const ESTADOS_COCINA = { NUEVO: 'nuevo', EN_PREPARACION: 'en_preparacion', LISTO: 'listo' };
export const HISTORY_PAGE_SIZE = 50;
const states = { pendiente: 'nuevo', en_preparacion: 'en_preparacion', listo: 'listo', entregado: 'entregado' };
const backendStates = { nuevo: 'pendiente', en_preparacion: 'en_preparacion', listo: 'listo' };
const fields = 'id,tipo,estado,estado_pago,notas,creado_en,actualizado_en,metodo_solicitado,cocina_entregado_en,entregas_cocina(items),mesas(numero),detalles_pedido(id,producto_id,cantidad,nombre_producto,requiere_preparacion),historial_estados_pedido(id,estado,cambiado_por,cambiado_en,es_reconstruido)';
const legacyFields = fields.replace('cocina_entregado_en,entregas_cocina(items),', '');
function missingDeliverySchema(error) {
  return ['PGRST200', 'PGRST202', 'PGRST204', '42P01', '42703'].includes(error?.code || error?.error) &&
    /entregas_cocina|cocina_entregado_en/.test(error.message || '');
}
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
  const entregados = new Map();
  for (const entrega of row.entregas_cocina || []) for (const item of entrega.items || []) {
    const key = String(item.producto_id);
    entregados.set(key, (entregados.get(key) || 0) + Number(item.cantidad));
  }
  const items = new Map();
  for (const item of row.detalles_pedido || []) {
    if (item.requiere_preparacion === false) continue;
    const key = String(item.producto_id);
    const previous = items.get(key);
    items.set(key, { id: item.id, productoId: item.producto_id, nombre: item.nombre_producto,
      cantidad: (previous?.cantidad || 0) + Number(item.cantidad) });
  }
  return { id: row.id, entregaDisponible: row.entregaDisponible !== false, historialId: row.historialId || row.id, actualizadoEn: row.actualizado_en,
    metodoSolicitado: row.metodo_solicitado, entregadoEn: row.entregado_en, esAnterior: row.esAnterior, tipo: row.tipo, mesa: row.mesas?.numero || null,
    cliente: row.mesas ? `Mesa ${row.mesas.numero}` : row.tipo === 'delivery' ? 'Delivery' : 'Recojo',
    estadoCocina: states[row.estado], backendStatus: row.estado, estadoPago: row.estado_pago,
    observaciones: row.notas || '', createdAt: row.creado_en,
    finalizadoAt: row.preparado_en || (['listo','entregado'].includes(row.estado) ? ready?.cambiado_en : null) || null,
    cambiadoPor: row.entregado_por || last?.cambiado_por || null, cambiadoEn: last?.cambiado_en || null,
    esReconstruido: Boolean(last?.es_reconstruido),
    items: [...items.values()].map(item => ({ ...item,
      cantidad: item.cantidad - (entregados.get(String(item.productoId)) || 0) })).filter(item => item.cantidad > 0) };
}
async function getPedidosActivos() {
  if(FLOW_PREVIEW){
    database();const data=await getFlow();
    return data.cuentas.filter(p=>['pendiente','en_preparacion','listo'].includes(p.estado)&&pendingKitchen(p).length).map(p=>({...mapPedido({...p,entregas_cocina:p.entregas,detalles_pedido:p.items,historial_estados_pedido:p.historial,mesas:p.mesa_id?{numero:data.mesas.find(m=>m.id===p.mesa_id)?.numero}:null}),cuenta:p,version:p.version_cuenta}));
  }
  const db = database(), result = [];
  let legacy = false;
  for (let offset = 0; ; offset += 100) {
    const read = () => {
      let query = db.from('pedidos').select(legacy ? legacyFields : fields).in('estado',['pendiente','en_preparacion','listo']);
      if (!legacy) query = query.is('cocina_entregado_en',null);
      return query.order('creado_en',{ascending:true}).order('id',{ascending:true}).range(offset,offset+99);
    };
    let response = await read();
    if (!legacy && missingDeliverySchema(response.error)) {
      legacy = true;
      response = await read();
    }
    const rows = unwrap(response) || [];
    result.push(...rows.map(row => mapPedido({ ...row, entregaDisponible: !legacy })).filter(pedido => pedido.items.length));
    if (rows.length < 100) return result;
  }
}
async function getPedidosFinalizados({ page = 0 } = {}) {
  if (!Number.isSafeInteger(page) || page < 0) throw new Error('Página inválida.');
  const db = database();
  const response = await db.rpc('obtener_historial_entregas_cocina', {
    p_limite: HISTORY_PAGE_SIZE, p_offset: page * HISTORY_PAGE_SIZE,
  });
  if (missingDeliverySchema(response.error)) {
    const rows = unwrap(await db.from('pedidos').select(legacyFields).in('estado', ['entregado'])
      .order('actualizado_en', { ascending: false }).order('id', { ascending: false })
      .range(page * HISTORY_PAGE_SIZE, (page + 1) * HISTORY_PAGE_SIZE - 1)) || [];
    return rows.map(row => mapPedido({ ...row, esAnterior: true, entregaDisponible: false }));
  }
  const rows = unwrap(response) || [];
  return rows.map(mapPedido);
}
async function cambiarEstado(pedido, nuevoEstado) {
  if(FLOW_PREVIEW){database();return operateFlow(({en_preparacion:'comenzar',listo:'listo',entregado:'entregar',detener:'detener'})[nuevoEstado],{pedido:pedido.id,version:pedido.version});}
  if (nuevoEstado === 'entregado') {
    if (pedido.entregaDisponible === false) throw new Error('La entrega de cocina aún no está habilitada en el servidor.');
    return unwrap(await database().rpc('entregar_pedido_cocina', {
      p_pedido_id: pedido.id, p_actualizado_en: pedido.actualizadoEn,
    }));
  }
  return unwrap(await database().rpc('cambiar_estado_cocina', { p_pedido_id: pedido.id,
    p_estado_actual: backendStates[pedido.estadoCocina], p_nuevo_estado: backendStates[nuevoEstado] }));
}
export default { getPedidosActivos, getPedidosFinalizados, cambiarEstado };
