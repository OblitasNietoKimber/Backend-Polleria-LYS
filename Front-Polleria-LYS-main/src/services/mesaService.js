import { SEED_MESAS, SEED_ACTIVIDADES, ESTADOS_MESA } from '../data/mesasData';
import { requireInsforge } from '../lib/insforge';
import { getCurrentUser } from './authService';
import { getPersonNameError, normalizePersonName } from '../utils/identityValidation';
import { isValidPhone } from './validators';
import { getReservationTimeError } from '../utils/reservationTime';
import { FLOW_PREVIEW, getFlowMesas, operateFlow, pendingKitchen, openIncident } from './atencionService';

const MESAS_KEY = 'lys_mesas';
const ACTIVIDADES_KEY = 'lys_actividades';

let cacheMesas = null;

function dispatchLocalEvent(eventName) {
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    try {
      window.dispatchEvent(new Event(eventName));
    } catch {
      // Ignorar en entornos sin DOM completo
    }
  }
}

function inicializar() {
  if (typeof window === 'undefined' || !window.localStorage) return;

  const dataMesas = localStorage.getItem(MESAS_KEY);
  if (!dataMesas) {
    localStorage.setItem(MESAS_KEY, JSON.stringify(SEED_MESAS));
  }

  if (!localStorage.getItem(ACTIVIDADES_KEY)) {
    localStorage.setItem(ACTIVIDADES_KEY, JSON.stringify(SEED_ACTIVIDADES));
  }
}

function unwrap({ data, error }, defaultMsg = 'Error en la operación de mesas.') {
  if (error) {
    throw new Error(error.message || defaultMsg);
  }
  return data;
}

function getDbClient() {
  const user = getCurrentUser();
  const insforge = requireInsforge();
  return { db: insforge.database, user };
}

function mapMesaFromDb(row) {
  const items = (row.items || []).map((it) => ({
    id: it.producto_id || it.id,
    nombre: it.nombre,
    cantidad: it.cantidad,
    precio: Number(it.precio),
    subtotal: Number(it.subtotal || it.cantidad * it.precio),
    observacion: it.observacion || '',
  }));

  return {
    id: Number(row.id),
    numero: String(row.numero).padStart(2, '0'),
    capacidad: Number(row.capacidad),
    forma: row.forma,
    zona: row.zona,
    estado: row.estado || ESTADOS_MESA.LIBRE,
    horaReserva: row.hora_reserva || null,
    clienteReserva: row.cliente_reserva || null,
    telefonoReserva: row.telefono_reserva || null,
    comensalesReserva: row.comensales_reserva || null,
    pedidoId: row.pedido_id || null,
    pedidoEstado: row.pedido_estado || null,
    estadoPago: row.estado_pago || 'pendiente',
    entregadoCocina: Boolean(row.cocina_entregado_en),
    estadoCocina: row.cocina_entregado_en ? 'entregado' : ({ pendiente: 'nuevo', en_preparacion: 'en_preparacion', listo: 'listo' })[row.pedido_estado] || null,
    cuentaSolicitada: Boolean(row.cuenta_solicitada),
    comensales: row.comensales || row.capacidad,
    subtotalAcumulado: Number(row.subtotal || 0),
    totalAcumulado: Number(row.total || 0),
    notas: row.notas || '',
    inicioAt: row.creado_en || null,
    items,
  };
}

/**
 * Consulta las mesas y sus pedidos activos directamente desde PostgreSQL (SCRUM-277).
 */
export async function fetchMesas({ strict = false } = {}) {
  try {
    if(FLOW_PREVIEW){
      const data=await getFlowMesas();
      cacheMesas=data.mesas.map(m=>{
        const atencion=data.atenciones.find(a=>a.mesa_id===m.id);
        const cuentas=atencion?data.cuentas.filter(p=>p.atencion_id===atencion.id):[];
        const editable=cuentas.find(p=>p.estado_pago!=='pagado'&&p.estado!=='cancelado');
        const principal=editable||cuentas[0];
        const mapped=mapMesaFromDb({...m,estado:atencion?'ocupada':m.estado,pedido_id:principal?.id,pedido_estado:principal?.estado,
          estado_pago:cuentas.filter(p=>p.estado!=='cancelado').every(p=>p.estado_pago==='pagado')?'pagado':'pendiente',
          cocina_entregado_en:principal?.cocina_entregado_en,cuenta_solicitada:editable?.cuenta_solicitada,
          comensales:principal?.comensales,total:cuentas.filter(p=>p.estado!=='cancelado').reduce((s,p)=>s+Number(p.total),0),
          subtotal:cuentas.filter(p=>p.estado!=='cancelado').reduce((s,p)=>s+Number(p.subtotal),0),notas:editable?.notas||'',creado_en:atencion?.abierta_en,
          items:(principal?.items||[]).map(i=>({id:i.id,producto_id:i.producto_id,nombre:i.nombre_producto,cantidad:i.cantidad,precio:i.precio_unitario}))});
        return {...mapped,atencionId:atencion?.id,cuentas,cuentaEditableId:editable?.id||null,
          versionCuenta:principal?.version_cuenta,puedeCerrar:Boolean(atencion)&&cuentas.every(p=>(p.estado==='cancelado'||p.estado_pago==='pagado'&&!pendingKitchen(p).length)&&!openIncident(p))};
      });
      return cacheMesas;
    }
    const { db } = getDbClient();
    const res = await db.rpc('obtener_mesas_con_pedidos');
    const data = unwrap(res, 'No se pudo obtener el estado de las mesas desde PostgreSQL.');
    const mesasMapeadas = (Array.isArray(data) ? data : []).map(mapMesaFromDb);

    {
      cacheMesas = mesasMapeadas;
      if (typeof window !== 'undefined') {
        try { localStorage.setItem(MESAS_KEY, JSON.stringify(mesasMapeadas)); } catch { /* El servidor sigue siendo la fuente de datos. */ }
      }
    }
    return mesasMapeadas;
  } catch (err) {
    if (strict) throw err;
    console.warn('Fallo al consultar mesas en PostgreSQL, usando cache local:', err.message);
    return getMesas();
  }
}

/**
 * Retorna las mesas sincronizadas (de memoria, de localStorage o semillas).
 */
export function getMesas() {
  if (cacheMesas !== null) {
    return cacheMesas;
  }

  inicializar();
  try {
    const data = localStorage.getItem(MESAS_KEY);
    const mesas = data ? JSON.parse(data) : SEED_MESAS;
    cacheMesas = mesas;
    return mesas;
  } catch (error) {
    console.error('Error al leer mesas locales:', error);
    return SEED_MESAS;
  }
}

function saveMesas(mesas) {
  cacheMesas = mesas;
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(MESAS_KEY, JSON.stringify(mesas));
    }
    dispatchLocalEvent('lys_mesas_updated');
  } catch (error) {
    console.error('Error al guardar mesas:', error);
  }
}

export function getMesaById(id) {
  const mesas = getMesas();
  return mesas.find((m) => m.id === Number(id)) || null;
}

export function getMesaByNumero(numero) {
  const mesas = getMesas();
  const numNormalizado = String(numero).padStart(2, '0');
  return mesas.find((m) => String(m.numero).padStart(2, '0') === numNormalizado) || null;
}

/**
 * Abre un pedido de salón y ocupa la mesa en PostgreSQL mediante RPC (SCRUM-278, SCRUM-282).
 */
export async function abrirPedidoSalon({
  solicitudId,
  mesaId,
  mesaNumero,
  comensales,
  notas = '',
  items = [],
  atencionId,
}) {
  const mesa = mesaId ? getMesaById(mesaId) : getMesaByNumero(mesaNumero);
  const idMesa = mesa ? mesa.id : Number(mesaNumero);
  if(FLOW_PREVIEW){
    const attention=atencionId??mesa?.atencionId;
    const result=await operateFlow(attention?'adicional':'abrir',{mesa:idMesa,atencion:attention,comensales:Number(comensales),notas,items:items.map(i=>({id:i.id,qty:i.cantidad}))},solicitudId||undefined);
    await fetchMesas({strict:true});return result.pedido;
  }

  const payloadArticulos = items.map((it) => ({
    id: it.id,
    qty: it.cantidad,
  }));

  const { db } = getDbClient();
  const res = await db.rpc('abrir_pedido_salon', {
    solicitud_id: solicitudId || null,
    p_mesa_id: idMesa,
    p_comensales: Number(comensales) || null,
    p_notas: notas || '',
    p_articulos: payloadArticulos,
  });

  const nuevoPedidoId = unwrap(res, 'No se pudo abrir el pedido en el servidor.');

  // Refrescar mesas desde la base de datos
  await fetchMesas();
  dispatchLocalEvent('lys_mesas_updated');
  dispatchLocalEvent('storage');

  return nuevoPedidoId;
}

/**
 * Permite agregar productos y observaciones a un pedido de salón abierto (SCRUM-279).
 */
export async function modificarPedidoSalon({ pedidoId, items = [], notas = null, version }) {
  if(FLOW_PREVIEW){
    if(version===undefined)throw new Error('Falta la versión de la comanda. Vuelve a abrirla desde Mesas.');
    await operateFlow('editar',{pedido:pedidoId,version,items:items.map(i=>({id:i.id,qty:i.cantidad})),notas});
    await fetchMesas({strict:true});return true;
  }
  const payloadArticulos = items.map((it) => ({
    id: it.id,
    qty: it.cantidad,
  }));

  const { db } = getDbClient();
  const res = await db.rpc('agregar_o_modificar_detalles_salon', {
    p_pedido_id: pedidoId,
    p_articulos: payloadArticulos,
    p_notas: notas !== null ? notas : null,
  });

  unwrap(res, 'No se pudo modificar el pedido en el servidor.');

  await fetchMesas();
  dispatchLocalEvent('lys_mesas_updated');
  dispatchLocalEvent('storage');
  return true;
}

/**
 * Registra el envío del pedido a cocina en PostgreSQL (SCRUM-280).
 */
export async function enviarPedidoCocina(pedidoId) {
  const { db } = getDbClient();
  const res = await db.rpc('enviar_pedido_cocina', {
    p_pedido_id: pedidoId,
  });

  unwrap(res, 'No se pudo enviar el pedido a cocina.');

  await fetchMesas();
  dispatchLocalEvent('lys_mesas_updated');
  dispatchLocalEvent('storage');
  return true;
}

/**
 * Registra la solicitud de cuenta para caja en PostgreSQL (SCRUM-281).
 */
export async function solicitarCuenta(pedidoId, mesaNumero) {
  if(FLOW_PREVIEW){const p=(await getFlowMesas()).cuentas.find(p=>p.id===pedidoId);if(!p)throw new Error('La cuenta ya no está disponible');await operateFlow('solicitar',{pedido:pedidoId,version:p.version_cuenta});await fetchMesas({strict:true});return true;}
  const { db } = getDbClient();
  const res = await db.rpc('solicitar_cuenta_salon', {
    p_pedido_id: pedidoId,
  });

  unwrap(res, 'No se pudo registrar la solicitud de cuenta.');

  if (mesaNumero) {
    registrarActividad({
      mesaNumero,
      tipo: 'pedido_actualizado',
      titulo: `Mesa ${String(mesaNumero).padStart(2, '0')}`,
      descripcion: 'Cuenta solicitada a caja',
      ordenCodigo: pedidoId || '',
      tipoColor: 'amarillo',
    });
  }

  await fetchMesas();
  dispatchLocalEvent('lys_mesas_updated');
  dispatchLocalEvent('storage');
  return true;
}

/**
 * Libera una mesa en PostgreSQL y actualiza la sincronización local (SCRUM-283).
 */
export async function liberarMesa(numero) {
  const mesa = getMesaByNumero(numero);
  const idMesa = mesa?.id || Number(numero);
  if (!idMesa) throw new Error('La mesa no existe.');
  if(FLOW_PREVIEW){await operateFlow(mesa.atencionId?'cerrar':'cancelar_reserva',{mesa:idMesa,atencion:mesa.atencionId,confirmar_salida:true});await fetchMesas({strict:true});return getMesaByNumero(numero);}
  const { db } = getDbClient();
  unwrap(await db.rpc('liberar_mesa_salon', { p_mesa_id: Number(idMesa) }), 'No se pudo liberar la mesa.');
  await fetchMesas();
  await fetchActividades();
  dispatchLocalEvent('lys_mesas_updated');
  dispatchLocalEvent('lys_actividades_updated');
  return getMesaByNumero(numero);
}

/**
 * Anula una comanda con saldo pendiente por incidente/retiro de cliente y libera la mesa (SCRUM-283).
 */
export async function anularComandaYLiberarMesa(numero, motivo = 'Cliente se retiró sin pagar') {
  const mesa = getMesaByNumero(numero);
  const idMesa = mesa?.id || Number(numero);
  if (!idMesa) throw new Error('La mesa no existe.');
  if(FLOW_PREVIEW){const p=mesa.cuentas.find(p=>p.id===mesa.pedidoId);if(!p)throw new Error('No hay una cuenta activa');await operateFlow('incidencia',{pedido:p.id,version:p.version_cuenta,motivo});await fetchMesas({strict:true});return getMesaByNumero(numero);}
  const { db } = getDbClient();
  unwrap(await db.rpc('anular_comanda_salon', {
    p_mesa_id: Number(idMesa),
    p_motivo: motivo || 'Incidente de salón'
  }), 'No se pudo anular la comanda y liberar la mesa.');
  await fetchMesas();
  await fetchActividades();
  dispatchLocalEvent('lys_mesas_updated');
  dispatchLocalEvent('lys_actividades_updated');
  return getMesaByNumero(numero);
}

export function ocuparMesa(numero, pedidoId, total = 0) {
  const mesas = getMesas();
  const numNormalizado = String(numero).padStart(2, '0');

  const actualizadas = mesas.map((m) => {
    if (String(m.numero).padStart(2, '0') === numNormalizado) {
      return {
        ...m,
        estado: ESTADOS_MESA.OCUPADA,
        pedidoId,
        inicioAt: new Date().toISOString(),
        totalAcumulado: total,
      };
    }
    return m;
  });

  saveMesas(actualizadas);
  return actualizadas.find((m) => String(m.numero).padStart(2, '0') === numNormalizado);
}

export async function reservarMesa(numero, { cliente, hora, comensales, telefono = '' } = {}) {
  const mesa = getMesaByNumero(numero);
  if (!mesa?.id) throw new Error('La mesa no existe.');

  const errorNombre = getPersonNameError(cliente, { label: 'nombre del cliente o grupo', requiredMessage: 'Ingresa un nombre de al menos 2 caracteres.' });
  if (errorNombre) throw new Error(errorNombre);
  const errorHora = getReservationTimeError(hora);
  if (errorHora) throw new Error(errorHora);

  const personas = typeof comensales === 'string' && /^[0-9]+$/.test(comensales)
    ? Number(comensales)
    : comensales;
  if (!Number.isInteger(personas) || personas < 1 || personas > mesa.capacidad) {
    throw new Error(`Ingresa entre 1 y ${mesa.capacidad} comensales para esta mesa.`);
  }

  const celular = typeof (telefono ?? '') === 'string' ? (telefono ?? '').replace(/ /g, '') : null;
  if (celular === null || (celular !== '' && (celular.length !== 9 || !isValidPhone(celular)))) {
    throw new Error('El celular debe comenzar con 9 y tener 9 dígitos.');
  }

  const nombre = normalizePersonName(cliente);
  if (FLOW_PREVIEW) {
    await operateFlow('reservar', { mesa: mesa.id, cliente: nombre, hora, telefono: celular, comensales: personas });
    await fetchMesas({ strict: true });
    return getMesaByNumero(numero);
  }

  const { db } = getDbClient();
  unwrap(await db.rpc('reservar_mesa_salon', {
    p_mesa_id: Number(mesa.id),
    p_cliente: nombre,
    p_hora: hora,
    p_telefono: celular,
    p_comensales: personas,
  }), 'No se pudo registrar la reserva en el servidor.');

  await fetchMesas();
  await fetchActividades();
  dispatchLocalEvent('lys_mesas_updated');
  dispatchLocalEvent('lys_actividades_updated');
  return getMesaByNumero(numero);
}

export function getEstadisticasMesas(zona = 'salon_principal') {
  const mesas = getMesas().filter((m) => !zona || m.zona === zona);
  const total = mesas.length || 1;

  const libres = mesas.filter((m) => m.estado === ESTADOS_MESA.LIBRE).length;
  const ocupadas = mesas.filter((m) => m.estado === ESTADOS_MESA.OCUPADA).length;
  const reservadas = mesas.filter((m) => m.estado === ESTADOS_MESA.RESERVADA).length;

  return {
    total,
    libres,
    ocupadas,
    reservadas,
    pctLibres: ((libres / total) * 100).toFixed(1),
    pctOcupadas: ((ocupadas / total) * 100).toFixed(1),
    pctReservadas: ((reservadas / total) * 100).toFixed(1),
  };
}

export async function fetchActividades() {
  try {
    if(FLOW_PREVIEW)return ((await getFlowMesas()).actividades||[]).map(a=>({id:a.id,mesaNumero:a.mesa_numero,tipo:a.tipo,tipoColor:a.tipo_color,titulo:a.titulo,descripcion:a.descripcion,ordenCodigo:a.orden_codigo,createdAt:a.creado_en}));
    const { db } = getDbClient();
    const res = await db.rpc('obtener_actividad_salon');
    const data = unwrap(res, 'No se pudo obtener la actividad desde PostgreSQL.');
    if (Array.isArray(data)) {
      const ordenadas = [...data].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
      if (typeof localStorage !== 'undefined') {
        try { localStorage.setItem(ACTIVIDADES_KEY, JSON.stringify(ordenadas)); } catch { /* ignore */ }
      }
      return ordenadas;
    }
    return getActividades();
  } catch {
    return getActividades();
  }
}

export function getActividades() {
  inicializar();
  try {
    const raw = localStorage.getItem(ACTIVIDADES_KEY);
    const lista = raw ? JSON.parse(raw) : SEED_ACTIVIDADES;
    return (Array.isArray(lista) ? lista : []).sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  } catch {
    return SEED_ACTIVIDADES;
  }
}

export function registrarActividad({ mesaNumero, tipo, titulo, descripcion, ordenCodigo, tipoColor }) {
  const actividades = getActividades();
  const ahora = new Date();
  const horaStr = ahora.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const nuevaActividad = {
    id: `ACT-${Date.now()}`,
    mesaNumero: String(mesaNumero).padStart(2, '0'),
    tipo: tipo || 'pedido_creado',
    titulo: titulo || `Mesa ${String(mesaNumero).padStart(2, '0')}`,
    descripcion: descripcion || 'Pedido actualizado',
    ordenCodigo: ordenCodigo || '',
    hora: horaStr,
    tipoColor: tipoColor || 'rojo',
    createdAt: ahora.toISOString(),
  };

  const listaActualizada = [nuevaActividad, ...actividades]
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
    .slice(0, 25);

  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(ACTIVIDADES_KEY, JSON.stringify(listaActualizada));
    }
    dispatchLocalEvent('lys_actividades_updated');
  } catch {
    // ignorar error de cuota
  }
  return nuevaActividad;
}


export function getMinutosOcupada(inicioAt) {
  if (!inicioAt) return 0;
  const diffMs = Date.now() - new Date(inicioAt).getTime();
  if (isNaN(diffMs) || diffMs < 0) return 0;
  return Math.floor(diffMs / 60000);
}

export default {
  fetchMesas,
  getMesas,
  getMesaById,
  getMesaByNumero,
  abrirPedidoSalon,
  modificarPedidoSalon,
  enviarPedidoCocina,
  solicitarCuenta,
  liberarMesa,
  anularComandaYLiberarMesa,
  ocuparMesa,
  reservarMesa,
  getEstadisticasMesas,
  fetchActividades,
  getActividades,
  registrarActividad,
  getMinutosOcupada,
};
