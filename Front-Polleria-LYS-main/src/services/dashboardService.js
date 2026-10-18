import { insforge, configurationError } from '../lib/insforge';
import { getCurrentUser } from './authService';

// Los indicadores se calculan en PostgreSQL con los pagos registrados; el navegador solo los presenta.
const METODOS = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', yape: 'Yape', plin: 'Plin' };

function database() {
  if (configurationError) throw new Error(configurationError);
  if (getCurrentUser()?.rol !== 'admin') throw new Error('Se requiere una cuenta de administrador.');
  if (!insforge) throw new Error('No se pudo conectar con InsForge.');
  return insforge.database;
}
function unwrap({ data, error }, mensaje) {
  if (error) throw new Error(error.message || mensaje);
  return data;
}
function rango({ fechaInicio = '', fechaFin = '' } = {}) {
  return { p_desde: fechaInicio || null, p_hasta: fechaFin || null };
}
const numeros = valores => (valores || []).map(Number);
const resumen = (r = {}) => ({ cantidadPedidos: Number(r.cantidadPedidos || 0), totalVentas: Number(r.totalVentas || 0) });
const tendencia = (t = {}) => ({ labels: t.labels || [], values: numeros(t.values) });

export function normalizarDashboard(data = {}) {
  const operativas = data.operativas || {};
  return {
    hoy: data.hoy || null,
    resumen: { dia: resumen(data.resumen?.dia), semana: resumen(data.resumen?.semana), mes: resumen(data.resumen?.mes), total: resumen(data.resumen?.total) },
    productos: (data.productos || []).map(p => ({ ...p, cantidad: Number(p.cantidad), total: Number(p.total) })),
    metodosPago: (data.metodosPago || []).map(m => ({ nombre: METODOS[m.metodo] || m.metodo, cantidad: Number(m.cantidad), total: Number(m.total) })),
    ventasPorDia: (data.ventasPorDia || []).map(d => ({ fecha: d.fecha, cantidad: Number(d.cantidad), total: Number(d.total) })),
    tendencias: { dia: tendencia(data.tendencias?.dia), semana: tendencia(data.tendencias?.semana), mes: tendencia(data.tendencias?.mes), total: tendencia(data.tendencias?.total) },
    operativas: {
      labels: (operativas.fechas || []).map(fecha =>
        new Date(`${fecha}T00:00:00`).toLocaleDateString('es-PE', { day: '2-digit', month: 'short' })),
      completados: numeros(operativas.completados), pendientes: numeros(operativas.pendientes),
      cancelados: numeros(operativas.cancelados), ventas: numeros(operativas.ventas),
    },
    pedidosPendientes: Number(data.pedidosPendientes || 0),
  };
}
function normalizarVenta(venta) {
  return { ...venta, total: Number(venta.total), pago: { ...venta.pago, metodoId: venta.pago?.metodo, metodo: METODOS[venta.pago?.metodo] || venta.pago?.metodo } };
}

export async function getDashboard(filtros) {
  const data = unwrap(await database().rpc('obtener_dashboard_admin', rango(filtros)), 'No se pudo consultar el dashboard.');
  return normalizarDashboard(data);
}
export async function getHistorialVentas(filtros, { limite = 10, siguiente = null } = {}) {
  const data = unwrap(await database().rpc('obtener_historial_ventas', {
    ...rango(filtros), p_limite: limite, p_antes_fecha: siguiente?.fecha ?? null, p_antes_id: siguiente?.id ?? null,
  }), 'No se pudo consultar el historial de ventas.');
  return { ventas: (data?.ventas || []).map(normalizarVenta), siguiente: data?.siguiente || null };
}
export async function getSelloCambios() {
  const { data, count, error } = await database().from('pedidos')
    .select('actualizado_en', { count: 'exact' }).order('actualizado_en', { ascending: false }).limit(1);
  if (error) throw new Error(error.message || 'No se pudo comprobar si cambiaron las ventas.');
  return JSON.stringify([count, data?.[0]?.actualizado_en ?? null]);
}
export default { getDashboard, getHistorialVentas, getSelloCambios };
