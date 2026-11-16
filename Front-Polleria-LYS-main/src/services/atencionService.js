import { requireInsforge } from '../lib/insforge';
import { getCurrentUser } from './authService';
export const FLOW_PREVIEW = import.meta.env.VITE_FLUJO_ATENCIONES === 'true';
export const LOCAL_FLOW = import.meta.env.DEV && import.meta.env.MODE === 'flujo-local';
async function rpc(name,args={}) {
  const {data,error}=await requireInsforge().database.rpc(name,args);
  if(error)throw Object.assign(new Error(error.message||'No se pudo completar la operación.'),{code:error.code||error.error});
  return data;
}
let cached;
export const getFlow = (pagina=0) => {
  const key=`${getCurrentUser()?.id}:${pagina}`;
  if(cached?.key===key && Date.now()-cached.time<500) return cached.promise;
  const promise=rpc('flujo_listar',{p_pagina:pagina||0});
  cached={key,time:Date.now(),promise};
  promise.catch(()=>{if(cached?.promise===promise)cached=null;});
  return promise;
};
export const getFlowStamp = () => rpc('flujo_sello');
export const operateFlow = async (accion,data,operacion=crypto.randomUUID()) => {
  try{return await rpc('flujo_operar',{p_accion:accion,p_datos:{...data,operacion}});}
  finally{cached=null;}
};
export function pendingKitchen(cuenta) {
  if(cuenta.cocina_cancelada_en) return [];
  const delivered=new Map();
  for(const entrega of cuenta.entregas||[])for(const item of entrega.items||[])delivered.set(String(item.producto_id),(delivered.get(String(item.producto_id))||0)+Number(item.cantidad));
  const items=new Map();
  for(const item of cuenta.items||[]){if(item.requiere_preparacion===false)continue;const id=String(item.producto_id);const old=items.get(id);items.set(id,{...item,cantidad:Number(item.cantidad)+(old?.cantidad||0)});}
  return [...items.values()].map(item=>({...item,cantidad:item.cantidad-(delivered.get(String(item.producto_id))||0)})).filter(item=>item.cantidad>0);
}
export const openIncident = cuenta => (cuenta.incidencias||[]).find(i=>['solicitada','autorizada'].includes(i.estado));
export const kitchenLabel = cuenta => cuenta.cocina_cancelada_en?'Preparación detenida':cuenta.estado==='cancelado'?'Anulado':!pendingKitchen(cuenta).length?'Entregado / servicio directo':({pendiente:'Nuevo',en_preparacion:'Preparando',listo:'Listo',en_camino:'En camino',entregado:'Entregado'})[cuenta.estado]||cuenta.estado;
export const accountLabel = cuenta => cuenta.estado==='cancelado'?'Anulada':cuenta.estado_pago==='pagado'?'Pagada':cuenta.cuenta_solicitada?'Solicitada':'Abierta';
