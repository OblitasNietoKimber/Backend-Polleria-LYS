import {useState} from 'react';
import {useAuth} from '../../hooks/useAuth';
import {openIncident} from '../../services/atencionService';
import '../../styles/attentionFlow.css';
import {money} from '../../utils/flowFormat';
export function IncidentActions({cuenta,flow}){
 const {user}=useAuth();const [reason,setReason]=useState(''),[reference,setReference]=useState('');const [editing,setEditing]=useState(false);
 const incident=openIncident(cuenta);const role=user?.rol;
 const execute=async(action,data={})=>{try{await flow.act(action,cuenta,data);setEditing(false);setReason('');}catch{/* La pantalla que contiene el control muestra el error. */}};
 if(incident)return <div className="flow-incident"><strong>{incident.tipo==='devolucion'?'Devolución':'Cancelación / incidente'} {incident.estado}</strong><p>{incident.motivo}</p>
 {role==='admin'&&incident.estado==='solicitada'&&<div className="flow-actions"><button disabled={flow.busy} onClick={()=>execute('autorizar')}>Autorizar solicitud</button><button disabled={flow.busy} onClick={()=>execute('rechazar')}>Rechazar solicitud</button></div>}
 {['cocina','admin'].includes(role)&&incident.estado==='autorizada'&&['anulacion','devolucion'].includes(incident.tipo)&&!cuenta.cocina_cancelada_en&&<button disabled={flow.busy} onClick={()=>execute('detener')}>Confirmar detención de cocina</button>}
 {['caja','admin'].includes(role)&&incident.estado==='autorizada'&&incident.tipo==='devolucion'&&<><p>Registra únicamente dinero realmente devuelto: {money(cuenta.total)}. El comprobante original se conserva.</p><label>Referencia de devolución<input value={reference} onChange={e=>setReference(e.target.value)} maxLength={120}/></label><button disabled={flow.busy||reference.trim().length<3} onClick={()=>execute('devolver',{importe:cuenta.total,referencia:reference.trim()})}>Confirmar devolución realizada</button></>}
 </div>;
 if(!['mesera','caja','admin'].includes(role)||cuenta.estado==='cancelado'||cuenta.incidencias?.some(i=>i.tipo==='devolucion'&&i.estado==='resuelta'))return null;
 return <div className="flow-incident-control">{!editing?<button disabled={flow.busy} onClick={()=>setEditing(true)}>{cuenta.estado_pago==='pagado'?'Solicitar devolución':'Anular / registrar incidente'}</button>:<><label>Motivo de la solicitud<textarea maxLength={500} value={reason} onChange={e=>setReason(e.target.value)}/></label><p>Si cocina ya comenzó, administración debe autorizar y cocina confirmar la detención. Los consumos entregados conservarán su registro.</p><div className="flow-actions"><button disabled={flow.busy||reason.trim().length<5} onClick={()=>execute('incidencia',{motivo:reason.trim()})}>Registrar solicitud</button><button disabled={flow.busy} onClick={()=>setEditing(false)}>Volver</button></div></>}</div>;
}
