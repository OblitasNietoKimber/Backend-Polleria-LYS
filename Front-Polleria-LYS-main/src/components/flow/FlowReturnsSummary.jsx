import {useEffect,useState} from 'react';
import {requireInsforge} from '../../lib/insforge';
import {money} from '../../utils/flowFormat';
import '../../styles/attentionFlow.css';
export default function FlowReturnsSummary({filters,revision}){
 const [summary,setSummary]=useState(null),[error,setError]=useState('');
 useEffect(()=>{let alive=true;const load=async()=>{try{const {data,error}=await requireInsforge().database.rpc('flujo_devoluciones',{p_desde:filters.fechaInicio||null,p_hasta:filters.fechaFin||null});if(error)throw error;if(alive){setSummary(data);setError('');}}catch(e){if(alive)setError(e.message);}};void load();const timer=setInterval(()=>{if(document.visibilityState==='visible')void load();},10000);return()=>{alive=false;clearInterval(timer);};},[filters,revision]);
 return <aside className="flow-notice" role="status">Los indicadores de ventas conservan los cobros brutos y sus comprobantes. {error?`No se pudo consultar devoluciones: ${error}`:summary?`Devoluciones realizadas en el periodo: ${summary.cantidad} · ${money(summary.total)}.`:'Consultando devoluciones…'} Las devoluciones se cuentan por fecha real de devolución.</aside>;
}
