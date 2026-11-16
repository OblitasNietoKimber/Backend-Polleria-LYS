import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Banknote, CheckCircle2, Clock3, ShoppingBag } from "lucide-react";
import { calcularResumenCaja, fechaLima } from '../utils/cajaSummary';
import { watchOrders } from '../services/orderUpdates';
import cajaService from "../services/pagoService";
import ListaPedidos from "../components/caja/ListaPedidos";
import BuscadorPedidos from "../components/caja/BuscadorPedidos";
import DetalleVenta from "../components/caja/DetalleVenta";
import FormularioPago from "../components/caja/FormularioPago";
import TicketModal from "../components/caja/TicketModal";
import { formatCodigoPedido } from "../utils/orderNumber";
import fondo from "../img/fondo.png";
import {FLOW_PREVIEW,operateFlow,openIncident} from '../services/atencionService';
import {IncidentActions} from '../components/flow/FlowShared';
import '../styles/attentionIntegration.css';
function inView(p,view){
  if(view==='cobrados')return p.estado==='pagado';
  if(p.estado!=='pendiente'||p.total<=0)return false;
  if(!FLOW_PREVIEW)return true;
  return view==='abiertas'?p.tipo==='salon'&&!p.cuentaSolicitada:p.tipo!=='salon'||p.cuentaSolicitada;
}

export default function CajaPage() {
  const [pedidos, setPedidos] = useState([]);
  const [fechaResumen, setFechaResumen] = useState(() => fechaLima());
  const [seleccionadoId, setSeleccionadoId] = useState(null);
  const [busqueda, setBusqueda] = useState("");
  const [vista, setVista] = useState("pendientes");
  const [metodo, setMetodo] = useState("Efectivo");
  const [monto, setMonto] = useState("");
  const [ventaConfirmada, setVentaConfirmada] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [cobrando, setCobrando] = useState(false);
  const [entregando, setEntregando] = useState(false);
  const [reintentoPendiente, setReintentoPendiente] = useState(false);
  const [filtroTipo,setFiltroTipo]=useState('todos'),[filtroCocina,setFiltroCocina]=useState('todos'),[fechaCobro,setFechaCobro]=useState(''),[soloReparto,setSoloReparto]=useState(false),[anticipado,setAnticipado]=useState(false);
  const intento = useRef(null);
  const bloqueo = useRef(false);
  const montado = useRef(false);
  const consulta = useRef(0);
  const consultando = useRef(false);
  const sello = useRef(null);

  const recargar = useCallback(async (forzar = true) => {
    if (bloqueo.current || (!forzar && consultando.current)) return;
    setFechaResumen(fechaLima());
    consultando.current = true;
    const version = ++consulta.current;
    try {
      const cambios = await cajaService.getSelloCambios();
      if (!montado.current || version !== consulta.current || bloqueo.current) return;
      if (!forzar && cambios === sello.current) { setError(""); return; }
      const data = await cajaService.getPedidos();
      if (!montado.current || version !== consulta.current || bloqueo.current) return;
      sello.current = cambios;
      setPedidos(data);
      setSeleccionadoId(actual => data.some(p => p.id === actual&&inView(p,vista)) ? actual : data.find(p=>inView(p,vista))?.id ?? null);
      setError("");
    } catch (err) {
      if (montado.current && version === consulta.current) setError(err.message || "No se pudieron consultar los pedidos.");
    } finally {
      if (version === consulta.current) consultando.current = false;
      if (montado.current && version === consulta.current) setCargando(false);
    }
  }, [vista]);

  useEffect(() => {
    montado.current = true;
    const inicial = setTimeout(recargar, 0);
    const stop = watchOrders(() => { if (!intento.current && !bloqueo.current) void recargar(false); }, { initialRefresh: false, poll: false });
    const timer = setInterval(() => {
      if (!intento.current && document.visibilityState === 'visible') recargar(false);
    }, 10000);
    const visible = () => { if (document.visibilityState === 'visible' && !intento.current) recargar(false); };
    document.addEventListener('visibilitychange', visible);
    return () => { montado.current = false; stop(); clearTimeout(inicial); clearInterval(timer); document.removeEventListener('visibilitychange', visible); };
  }, [recargar]);

  const pendientes = pedidos.filter(p=>inView(p,'pendientes'));
  const abiertas=FLOW_PREVIEW?pedidos.filter(p=>inView(p,'abiertas')):[];
  const cobrados = pedidos.filter((pedido) => pedido.estado === "pagado");
  const listaActiva = vista === "pendientes" ? pendientes : vista==='abiertas'?abiertas:cobrados;

  const pedidosFiltrados = listaActiva.filter((pedido) =>
    `${pedido.codigo} ${formatCodigoPedido(pedido.codigo || pedido.id)} ${pedido.mesa || pedido.tipo} ${pedido.cliente}`
      .toLowerCase()
      .includes(busqueda.trim().toLowerCase())&&(!FLOW_PREVIEW||((filtroTipo==='todos'||pedido.tipo===filtroTipo)&&(filtroCocina==='todos'||pedido.estadoCocina===filtroCocina)&&(!fechaCobro||vista!=='cobrados'||fechaLima(pedido.pagadoAt)===fechaCobro)&&(!soloReparto||pedido.tipo==='delivery'&&pedido.estadoPedido==='en_camino')))
  );

  const pedidoActivo = pedidos.find((pedido) => pedido.id === seleccionadoId) ?? null;
  const total = pedidoActivo ? cajaService.calcularTotal(pedidoActivo) : 0;
  const montoNumerico = Number(monto);
  const montoValido = monto !== "" && /^\d+(\.\d{1,2})?$/.test(monto) && Number.isFinite(montoNumerico) && montoNumerico > 0;
  const puedeCobrar = Boolean(
    pedidoActivo &&
      pedidoActivo.estado === "pendiente" && total > 0 && !cargando && !cobrando && !entregando &&
      (!FLOW_PREVIEW||(!openIncident(pedidoActivo.cuenta||{})&&(pedidoActivo.tipo!=='salon'||pedidoActivo.cuentaSolicitada||anticipado)))&&
      (metodo !== "Efectivo" || (montoValido && montoNumerico >= total))
  );

  const resumen = useMemo(() => calcularResumenCaja(pedidos, fechaResumen), [pedidos, fechaResumen]);

  function cambiarVista(nuevaVista) {
    if (bloqueo.current || intento.current) return;
    const nuevaLista = nuevaVista === "pendientes" ? pendientes : nuevaVista==='abiertas'?abiertas:cobrados;
    setVista(nuevaVista);
    setBusqueda("");
    setSeleccionadoId(nuevaLista[0]?.id ?? null);
    setMonto("");
    setAnticipado(false);setSoloReparto(false);setFechaCobro('');
  }

  function cambiarMetodo(nuevoMetodo) {
    if (bloqueo.current || intento.current) return;
    setMetodo(nuevoMetodo);
    setMonto(nuevoMetodo === "Efectivo" ? "" : total.toFixed(2));
  }

  async function confirmarVenta() {
    if (!puedeCobrar || bloqueo.current) return;
    bloqueo.current = true;
    ++consulta.current;
    setCobrando(true);
    setError("");
    intento.current ??= { id: seleccionadoId, data: {
      metodo, monto: metodo === "Efectivo" ? montoNumerico : total,
      idempotencia: crypto.randomUUID(), totalEsperado: total,
      version:pedidoActivo?.versionCuenta,anticipado,
    } };
    try {
      const pedidoPagado = await cajaService.registrarCobro(intento.current.id, intento.current.data);
      if (!montado.current) return;
      setPedidos(actual => actual.map(p => p.id === pedidoPagado.id ? pedidoPagado : p));
      setVentaConfirmada(pedidoPagado);
      intento.current = null;
      setReintentoPendiente(false);
    } catch (err) {
      if (montado.current) {
        setError(err.message || "No se pudo confirmar el cobro. Reintenta para consultar su resultado.");
        setReintentoPendiente(true);
      }
    } finally {
      bloqueo.current = false;
      if (montado.current) setCobrando(false);
    }
  }

  async function confirmarEntregaDelivery() {
    if (bloqueo.current || intento.current || !pedidoActivo) return;
    bloqueo.current = true;
    ++consulta.current;
    setEntregando(true);
    setError('');
    try {
      await cajaService.confirmarEntregaDelivery(pedidoActivo.id,pedidoActivo.versionCuenta);
    } catch (err) {
      if (montado.current) setError(err.message || 'No se pudo confirmar la entrega.');
      return;
    } finally {
      bloqueo.current = false;
      if (montado.current) setEntregando(false);
    }
    await recargar();
  }

  function cerrarTicket() {
    const primerPendiente = pendientes[0];
    setVentaConfirmada(null);
    setVista("pendientes");
    setSeleccionadoId(primerPendiente?.id ?? null);
    setMonto("");
    setMetodo("Efectivo");
    recargar();
  }

  async function revisarCuenta() {
    if (bloqueo.current) return;
    intento.current = null;
    setReintentoPendiente(false);
    setMonto("");
    setCargando(true);
    await recargar();
  }
  async function gestionarIncidencia(action,cuenta,extra={}){
    if(bloqueo.current||intento.current)return;bloqueo.current=true;setEntregando(true);setError('');
    let fallo='';
    try{return await operateFlow(action,{pedido:cuenta.id,version:cuenta.version_cuenta,...extra});}
    catch(err){fallo=err.message||'No se pudo registrar la incidencia.';throw err;}
    finally{await recargar();if(fallo)setError(fallo);bloqueo.current=false;setEntregando(false);}
  }

  return (
    <div className="lys-root caja-page">
      <main className="caja-main">
        <section className="caja-intro" aria-labelledby="caja-title">
          <div className="caja-heading">
            <div className="caja-title-row">
              <h1 id="caja-title" className="caja-title font-display">Caja</h1>
              <span className="caja-open-badge">
                <span aria-hidden="true" />
                Caja abierta
              </span>
            </div>
            <p>Gestiona tus cobros de forma rápida y sencilla.</p>
          </div>

          <div className="caja-banner">
            <div className="caja-banner-copy">
              <span>El sabor de siempre</span>
              <strong>Un buen servicio termina con un cobro perfecto.</strong>
            </div>
            <img src={fondo} alt="Pollo a la brasa con papas" />
          </div>
        </section>

        <section className="caja-summary" aria-label="Resumen de caja">
          <article className="caja-summary-card">
            <span className="caja-summary-icon red"><Banknote size={22} /></span>
            <div><p>Ventas del día</p><strong>S/ {resumen.ventas.toFixed(2)}</strong></div>
          </article>
          <article className="caja-summary-card">
            <span className="caja-summary-icon dark"><Banknote size={22} /></span>
            <div><p>Efectivo cobrado del día</p><strong>S/ {resumen.efectivo.toFixed(2)}</strong></div>
          </article>
          <article className="caja-summary-card">
            <span className="caja-summary-icon gold"><CheckCircle2 size={22} /></span>
            <div><p>Pedidos cobrados</p><strong>{resumen.cobrados}</strong></div>
          </article>
          <article className="caja-summary-card">
            <span className="caja-summary-icon dark"><Clock3 size={22} /></span>
            <div><p>Por cobrar</p><strong>S/ {resumen.porCobrar.toFixed(2)}</strong></div>
          </article>
        </section>

        {cargando && <p role="status">Consultando pedidos…</p>}
        {error && <div role="alert" className="caja-error">{error}</div>}
        <button type="button" className="caja-refresh-button" disabled={entregando || cobrando || cargando} onClick={revisarCuenta}>
          {reintentoPendiente ? "Actualizar y revisar el resultado" : "Actualizar pedidos"}
        </button>
        <div className="caja-layout" aria-busy={cargando || cobrando || entregando}>
          <section className="caja-orders-panel" aria-labelledby="pedidos-title">
            <div className="caja-section-title">
              <div>
                <span className="caja-eyebrow">Salón, delivery y recojo</span>
                <h2 id="pedidos-title">Pedidos</h2>
              </div>
              <ShoppingBag size={21} aria-hidden="true" />
            </div>

            <BuscadorPedidos valor={busqueda} onChange={setBusqueda} />

            <div className="caja-tabs" role="tablist" aria-label="Estado de pedidos">
              <button
                type="button"
                role="tab"
                aria-selected={vista === "pendientes"}
                className={vista === "pendientes" ? "active" : ""}
                disabled={entregando || cobrando || reintentoPendiente}
                onClick={() => cambiarVista("pendientes")}
              >
                {FLOW_PREVIEW?'Por cobrar':'Pendientes'} <span>{pendientes.length}</span>
              </button>
              {FLOW_PREVIEW&&<button type="button" role="tab" aria-selected={vista==='abiertas'} className={vista==='abiertas'?'active':''} disabled={entregando||cobrando||reintentoPendiente} onClick={()=>cambiarVista('abiertas')}>Cuentas abiertas <span>{abiertas.length}</span></button>}
              <button
                type="button"
                role="tab"
                aria-selected={vista === "cobrados"}
                className={vista === "cobrados" ? "active" : ""}
                disabled={entregando || cobrando || reintentoPendiente}
                onClick={() => cambiarVista("cobrados")}
              >
                Cobrados <span>{cobrados.length}</span>
              </button>
            </div>

            {FLOW_PREVIEW&&<div className="attention-caja-filters"><label>Tipo de atención<select value={filtroTipo} onChange={e=>setFiltroTipo(e.target.value)}><option value="todos">Todos</option><option value="salon">Salón</option><option value="recojo">Para llevar</option><option value="delivery">Delivery</option></select></label><label>Estado de cocina<select value={filtroCocina} onChange={e=>setFiltroCocina(e.target.value)}>{['todos','Nuevo','Preparando','Listo','Entregado / servicio directo','Preparación detenida','Anulado'].map(s=><option key={s} value={s}>{s==='todos'?'Todos':s}</option>)}</select></label>{vista==='cobrados'&&<><label>Fecha de cobro<input type="date" value={fechaCobro} onChange={e=>setFechaCobro(e.target.value)}/></label><label className="attention-confirm"><input type="checkbox" checked={soloReparto} onChange={e=>setSoloReparto(e.target.checked)}/>Delivery pendiente de entrega</label></>}</div>}

            <ListaPedidos
              pedidos={pedidosFiltrados}
              pedidoSeleccionado={seleccionadoId}
              disabled={entregando || cobrando || reintentoPendiente}
              onSeleccionar={(id) => {
                setSeleccionadoId(id);
                setMonto("");
                setMetodo("Efectivo");
                setAnticipado(false);
              }}
            />
          </section>

          <section className="caja-payment-panel" aria-label="Cobro del pedido">
            <DetalleVenta pedido={pedidoActivo} />
            {FLOW_PREVIEW&&pedidoActivo&&<p className="attention-status">Cocina: {pedidoActivo.estadoCocina} · Cuenta: {pedidoActivo.estado==='pagado'?'Pagada':pedidoActivo.cuentaSolicitada?'Solicitada':'Abierta'} · Pago: {pedidoActivo.estado==='pagado'?'Confirmado':'Pendiente'}</p>}
            {FLOW_PREVIEW&&pedidoActivo?.estado==='pendiente'&&pedidoActivo.tipo==='salon'&&!pedidoActivo.cuentaSolicitada&&<div className="attention-caja-notice"><label className="attention-confirm"><input type="checkbox" checked={anticipado} disabled={cobrando||reintentoPendiente} onChange={e=>setAnticipado(e.target.checked)}/>Confirmo el cobro anticipado.</label><p>La mesa seguirá ocupada y los platos pendientes continuarán en cocina. Los consumos posteriores irán a una cuenta adicional.</p></div>}
            {FLOW_PREVIEW&&pedidoActivo?.cuenta&&<IncidentActions cuenta={pedidoActivo.cuenta} flow={{busy:entregando||cobrando||reintentoPendiente,act:gestionarIncidencia}}/>}
            {pedidoActivo?.tipo === 'delivery' && pedidoActivo.estadoPedido === 'en_camino' && (
              <p role="status">En camino. {pedidoActivo.estado === 'pagado' ? 'Confirma cuando el repartidor entregue al cliente.' : 'Registra el cobro recibido antes de confirmar la entrega al cliente.'}</p>
            )}
            {pedidoActivo?.tipo === 'delivery' && pedidoActivo.estadoPedido === 'en_camino' && pedidoActivo.estado === 'pagado' && (
              <button type="button" className="btn-ember caja-confirm-button" disabled={entregando || cobrando || reintentoPendiente}
                onClick={confirmarEntregaDelivery}>
                {entregando ? 'Confirmando entrega…' : 'Confirmar entrega al cliente'}
              </button>
            )}

            {pedidoActivo?.estado === "pendiente" && (
              <>
                <FormularioPago
                  metodo={metodo}
                  onMetodoChange={cambiarMetodo}
                  monto={monto}
                  onMontoChange={setMonto}
                  total={total}
                  disabled={entregando || cobrando || reintentoPendiente}
                />

                {metodo === "Efectivo" && montoValido && (
                  <div className={`caja-change ${montoNumerico < total ? "insufficient" : ""}`}>
                    <span>{montoNumerico < total ? "Monto pendiente" : "Vuelto estimado"}</span>
                    <strong className="font-mono">
                      S/ {Math.abs(montoNumerico - total).toFixed(2)}
                    </strong>
                  </div>
                )}

                <button
                  type="button"
                  className="btn-ember caja-confirm-button"
                  disabled={!puedeCobrar}
                  onClick={confirmarVenta}
                >
                  <CheckCircle2 size={19} />
                  {cobrando ? "Confirmando cobro…" : reintentoPendiente ? "Reintentar el mismo cobro" : `Cobrar S/ ${total.toFixed(2)}`}
                </button>
              </>
            )}
            {pedidoActivo?.estado === "pagado" && pedidoActivo.pago && (
              <button type="button" className="btn-ember" onClick={() => setVentaConfirmada(pedidoActivo)}>Ver comprobante</button>
            )}
          </section>
        </div>

        {ventaConfirmada && (
          <TicketModal
            pedido={ventaConfirmada}
            total={cajaService.calcularTotal(ventaConfirmada)}
            metodo={ventaConfirmada.pago.metodo}
            monto={ventaConfirmada.pago.monto}
            vuelto={ventaConfirmada.pago.vuelto}
            onClose={cerrarTicket}
          />
        )}
      </main>
    </div>
  );
}
