import { insforge, configurationError } from '../lib/insforge';
import { getCurrentUser } from './authService';
import {FLOW_PREVIEW,operateFlow,kitchenLabel} from './atencionService';

const METODOS = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', yape: 'Yape', plin: 'Plin' };
const CAMPOS = 'id, tipo, estado, estado_pago, cuenta_solicitada, destinatario, subtotal, envio, total, creado_en, metodo_solicitado, mesas(numero), detalles_pedido(producto_id, cantidad, precio_unitario, nombre_producto), pagos(id, metodo, monto, recibido, vuelto, referencia, creado_en, comprobante)';
const DETALLES_COMANDA = 'id,requiere_preparacion,producto_id,cantidad,precio_unitario,nombre_producto';
const CAMPOS_ATENCION = CAMPOS.replace(
  'detalles_pedido(producto_id, cantidad, precio_unitario, nombre_producto)', `detalles_pedido(${DETALLES_COMANDA})`,
) + ',version_cuenta,atencion_id,cocina_cancelada_en,entregas_cocina(items),incidencias_atencion(id,tipo,estado,motivo,importe,referencia,creada_en,resuelta_en)' +
  `,comandas:comandas_cuenta(estado,cocina_cancelada_en,entregas_cocina(items),detalles_pedido(${DETALLES_COMANDA}))`;
const columnasCaja = () => (FLOW_PREVIEW ? CAMPOS_ATENCION : CAMPOS).replace(', comprobante)', ')');

function mapAtencion(row) {
  const rawPago = Array.isArray(row.pagos) ? row.pagos[0] : (row.pagos || null);
  const cuenta = { ...row, items: row.detalles_pedido, entregas: row.entregas_cocina, incidencias: row.incidencias_atencion, pago: rawPago };
  const comandas = (row.comandas || []).filter(comanda => comanda.estado !== 'cancelado');
  const detalles = [...(row.detalles_pedido || []), ...comandas.flatMap(comanda => comanda.detalles_pedido || [])];
  const estadosCocina = [kitchenLabel(cuenta), ...comandas.map(comanda => kitchenLabel({
    ...comanda, items: comanda.detalles_pedido, entregas: comanda.entregas_cocina,
  }))];
  const estadoCocina = ['Nuevo', 'Preparando', 'Listo'].find(estado => estadosCocina.includes(estado)) || estadosCocina[0];
  return {
    ...normalizarPedido({ ...row, detalles_pedido: detalles }),
    cuentaSolicitada: row.cuenta_solicitada, versionCuenta: row.version_cuenta, estadoCocina, cuenta,
  };
}

function database() {
  if (configurationError) throw new Error(configurationError);
  if (!['caja', 'admin'].includes(getCurrentUser()?.rol)) throw new Error('Se requiere una cuenta de caja o administrador.');
  if (!insforge) throw new Error('No se pudo conectar con InsForge.');
  return insforge.database;
}
function unwrap({ data, error }) {
  if (error) throw new Error(error.message || 'No se pudo consultar caja.');
  return data;
}
function normalizarComprobante(recibo) {
  const metodoLower = String(recibo.pago?.metodo || '').toLowerCase();
  return {
    ...recibo,
    estado: recibo.estado || 'pagado',
    pagadoAt: recibo.pagadoAt || recibo.pago?.creado_en || recibo.createdAt || new Date().toISOString(),
    subtotal: Number(recibo.subtotal),
    envio: Number(recibo.envio),
    total: Number(recibo.total),
    items: (recibo.items || []).map(item => ({ ...item, cantidad: Number(item.cantidad), precio: Number(item.precio) })),
    pago: {
      ...recibo.pago,
      metodoId: metodoLower,
      metodo: METODOS[metodoLower] || recibo.pago?.metodo,
      monto: Number(recibo.pago?.monto ?? 0),
      importe: Number(recibo.pago?.importe ?? recibo.pago?.monto ?? 0),
      vuelto: Number(recibo.pago?.vuelto ?? 0),
    },
  };
}
function normalizarPedido(row) {
  const pago = Array.isArray(row.pagos) ? row.pagos[0] : (row.pagos || null);
  const metodoSolicitadoKey = row.metodo_solicitado ? String(row.metodo_solicitado).toLowerCase() : null;
  const metodoSolicitado = metodoSolicitadoKey ? (METODOS[metodoSolicitadoKey] || row.metodo_solicitado) : null;
  if (pago?.comprobante) {
    return {
      ...normalizarComprobante(pago.comprobante),
      estadoPedido: row.estado,
      metodoSolicitado,
    };
  }
  const metodoLower = String(pago?.metodo || '').toLowerCase();
  return {
    id: row.id, codigo: row.id, tipo: row.tipo, mesa: row.mesas?.numero || null,
    cliente: row.destinatario?.name || (row.mesas ? `Mesa ${row.mesas.numero}` : 'Cliente'),
    estado: pago || row.estado_pago === 'pagado' ? 'pagado' : row.estado === 'cancelado' ? 'cancelado' : 'pendiente',
    estadoPedido: row.estado, cuentaSolicitada: Boolean(row.cuenta_solicitada),
    subtotal: Number(row.subtotal), envio: Number(row.envio), total: Number(pago?.monto ?? row.total),
    createdAt: row.creado_en, pagadoAt: pago?.creado_en || (row.estado_pago === 'pagado' ? row.creado_en : null),
    metodoSolicitado,
    items: (row.detalles_pedido || []).map(item => ({ id: item.producto_id, nombre: item.nombre_producto,
      cantidad: Number(item.cantidad), precio: Number(item.precio_unitario) })),
    pago: pago ? {
      id: pago.id,
      metodoId: metodoLower,
      metodo: METODOS[metodoLower] || pago.metodo,
      monto: Number(pago.recibido ?? pago.monto),
      importe: Number(pago.monto),
      vuelto: Number(pago.vuelto ?? 0),
      referencia: pago.referencia,
    } : null,
  };
}
// `max` limita las filas descargadas (p. ej. solo los últimos cobros) para no bajar todo el historial.
async function consultar(estado = null, { max = Infinity } = {}) {
  const db = database(), pedidos = [], size = Math.min(100, max);
  for (let offset = 0; ; offset += size) {
    let query = db.from('pedidos').select(columnasCaja()).order('creado_en', { ascending: false }).order('id').range(offset, offset + size - 1);
    if (FLOW_PREVIEW) query = query.is('cuenta_principal_id', null);
    if (estado) query = query.eq('estado_pago', estado);
    if (estado === 'pendiente') query = query.neq('estado', 'cancelado').gt('total', 0);
    const rows = unwrap(await query) || [];
    pedidos.push(...rows.map(FLOW_PREVIEW?mapAtencion:normalizarPedido));
    if (rows.length < size || pedidos.length >= max) return pedidos;
  }
}
// Caja solo necesita las cuentas por cobrar y los últimos cobros, no todos los pedidos históricos.
const COBROS_RECIENTES = 100;
const ordenarPedidos = (a, b) => String(b.createdAt).localeCompare(String(a.createdAt)) || a.id.localeCompare(b.id);
export async function getPedidos() {
  const [pendientes, cobrados] = await Promise.all([consultar('pendiente'), consultar('pagado', { max: COBROS_RECIENTES })]);
  return [...pendientes, ...cobrados].sort(ordenarPedidos);
}
export async function actualizarPedidos(actuales, cambios) {
  const ids = [...new Set(cambios.map(cambio => cambio.pedidoId))];
  if (ids.some(id => !id)) return getPedidos();
  const db = database();
  let query = db.from('pedidos').select(columnasCaja()).in('id', ids);
  if (FLOW_PREVIEW) query = query.is('cuenta_principal_id', null);
  const rows = unwrap(await query) || [];
  const pendientes = rows.filter(row => row.estado_pago === 'pendiente' && row.estado !== 'cancelado' && Number(row.total) > 0);
  const pagados = rows.filter(row => row.estado_pago === 'pagado');
  const map = FLOW_PREVIEW ? mapAtencion : normalizarPedido;
  const actualizados = [...actuales.filter(pedido => !ids.includes(pedido.id)), ...pendientes.map(map), ...pagados.map(map)];
  const anterioresPagados = actuales.filter(pedido => pedido.estado === 'pagado');
  const requiereCompletar = anterioresPagados.length === COBROS_RECIENTES &&
    anterioresPagados.some(pedido => ids.includes(pedido.id) && !pagados.some(row => row.id === pedido.id));
  const cobrados = requiereCompletar
    ? await consultar('pagado', { max: COBROS_RECIENTES })
    : actualizados.filter(pedido => pedido.estado === 'pagado').sort(ordenarPedidos).slice(0, COBROS_RECIENTES);
  return [...actualizados.filter(pedido => pedido.estado !== 'pagado'), ...cobrados].sort(ordenarPedidos);
}
export async function getResumenDia(dia) {
  return unwrap(await database().rpc('obtener_resumen_caja', { p_dia: dia }));
}
export const getPedidosPendientes = () => consultar('pendiente');
export const getVentas = () => consultar('pagado');
export async function getPedidoPorId(id) {
  let query = database().from('pedidos').select(FLOW_PREVIEW ? CAMPOS_ATENCION : CAMPOS).eq('id', id);
  if (FLOW_PREVIEW) query = query.is('cuenta_principal_id', null);
  const row = unwrap(await query.maybeSingle());
  return row ? (FLOW_PREVIEW?mapAtencion(row):normalizarPedido(row)) : null;
}
export function calcularTotal(pedido) { return Number(pedido.total); }
export async function registrarCobro(id, { metodo, monto, idempotencia, totalEsperado, referencia = null,version,anticipado=false }) {
  const metodoId = Object.keys(METODOS).find(key => METODOS[key] === metodo) || metodo;
  database();
  const recibo = FLOW_PREVIEW?await operateFlow('cobrar',{pedido:id,version,metodo:metodoId,recibido:Number(monto),anticipado,referencia},idempotencia):unwrap(await database().rpc('registrar_cobro', {
    p_pedido_id: id, p_metodo: metodoId, p_recibido: Number(monto),
    p_idempotencia: idempotencia, p_total_esperado: Number(totalEsperado), p_referencia: referencia,
  }));
  if (!recibo?.pago || !recibo.items) throw new Error('El servidor no devolvió un comprobante válido. Reintenta el mismo cobro.');
  return normalizarComprobante(recibo);
}
export async function confirmarEntregaDelivery(id,version) {
  if(FLOW_PREVIEW){database();return operateFlow('confirmar_delivery',{pedido:id,version});}
  return unwrap(await database().rpc('confirmar_entrega_delivery', { p_pedido_id: id }));
}
export default { confirmarEntregaDelivery, getPedidos, actualizarPedidos, getResumenDia, getPedidosPendientes, getPedidoPorId, getVentas, calcularTotal, registrarCobro };
