import {useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {operateFlow,openIncident,pendingKitchen,kitchenLabel} from '../../services/atencionService';
import {IncidentActions} from '../flow/FlowShared';
import './atencionCuentas.css';
export default function AtencionCuentas({mesa,onUpdated,onError,onClose}){
 const navigate=useNavigate();const [busy,setBusy]=useState(false),[salida,setSalida]=useState(false);
 const cuentas = mesa.cuentas || [];
 const principales = cuentas.filter(p => !p.cuenta_principal_id);
 const cuentaAbierta = principales.find(p => p.id === mesa.cuentaAbiertaId);
 const act=async(action,cuenta,extra={})=>{
  if(busy)return;setBusy(true);onError('');
  try{const result=await operateFlow(action,{...(cuenta?{pedido:cuenta.id,version:cuenta.version_cuenta}:{}),...extra});await onUpdated?.();return result;}
  catch(e){onError(e.message);throw e;}finally{setBusy(false);}
 };
 const run=(action,p,extra)=>void act(action,p,extra).catch(()=>{});
 const edit=()=>{onClose();navigate(`/mesas/${mesa.numero}/pedido`);};
 return <div className="attention-accounts">{principales.map((p,index)=><section className="mesa-comanda-box" key={p.id}>
 <h4 className="mesa-comanda-title" title={p.id}>Cuenta {principales.length-index} · S/ {Number(p.total).toFixed(2)}</h4>
 <p className="attention-status">{p.estado==='cancelado'?'Anulada':p.estado_pago==='pagado'?'Pagada':p.cuenta_solicitada?'Cuenta solicitada':'Cuenta abierta'} · Cocina: {kitchenLabel(p)}</p>
 {[p, ...cuentas.filter(comanda => comanda.cuenta_principal_id === p.id).reverse()].map(comanda => (
  <div key={comanda.id}>
   {comanda.cuenta_principal_id && <p className="attention-status">Comanda adicional · {kitchenLabel(comanda)}</p>}
   <ul className="mesa-comanda-list">{comanda.items.map(item => <li key={item.id}>
    {item.cantidad} × {item.nombre_producto} · S/ {(Number(item.precio_unitario) * item.cantidad).toFixed(2)}
   </li>)}</ul>
   {comanda.cuenta_principal_id && <IncidentActions cuenta={comanda} flow={{busy,act}}/>}
  </div>
 ))}
 {p.id===cuentaAbierta?.id&&!openIncident(p)&&<div className="mesa-actions-col">{p.cuenta_solicitada?<button className="mesa-btn-secondary-warn" disabled={busy} onClick={()=>run('reabrir',p)}>Reabrir cuenta para añadir productos</button>:<><button className="btn-nuevo-pedido mesa-btn-block" disabled={busy} onClick={edit}>{p.id === mesa.cuentaEditableId ? 'Editar comanda' : 'Nueva comanda para esta mesa'}</button><button className="mesa-btn-secondary-warn" disabled={busy} onClick={()=>run('solicitar',p)}>Solicitar cuenta para caja</button></>}</div>}
 <IncidentActions cuenta={p} flow={{busy,act}}/>
 </section>)}
 {!cuentaAbierta&&<button className="btn-nuevo-pedido mesa-btn-block" disabled={busy} onClick={edit}>Abrir cuenta adicional</button>}
 <p className="attention-status">La mesa sigue ocupada aunque se haya cobrado. Para cerrar, todas las cuentas deben estar pagadas o anuladas, sin platos ni incidencias pendientes.</p>
 <label className="attention-confirm"><input type="checkbox" checked={salida} onChange={e=>setSalida(e.target.checked)}/>Los clientes se retiraron y la mesa está disponible.</label>
 <button className="mesa-btn-secondary-neutral" disabled={busy||!salida||!mesa.puedeCerrar} onClick={async()=>{try{await act('cerrar',null,{mesa:mesa.id,atencion:mesa.atencionId,confirmar_salida:true});onClose();}catch{/* error visible */}}}>Cerrar atención y liberar mesa</button>
 {!mesa.puedeCerrar&&<p className="attention-status">{cuentas.some(p=>pendingKitchen(p).length&&p.estado!=='cancelado')?'Hay platos pendientes de cocina.':'Revisa las cuentas y las incidencias pendientes.'}</p>}
 </div>;
}
