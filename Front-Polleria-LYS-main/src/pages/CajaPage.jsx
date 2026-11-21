import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Banknote, CheckCircle2, Clock3, ShoppingBag } from "lucide-react";
import { calcularResumenCaja, fechaLima } from '../utils/cajaSummary';
import { ORDER_EVENT, PAYMENT_EVENT } from '../services/orderUpdates';
import useOrderResource from '../hooks/useOrderResource';
import useFechaLima from '../hooks/useFechaLima';
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
const eventosCaja = [ORDER_EVENT, PAYMENT_EVENT];
const eventosResumen = [PAYMENT_EVENT];
const sinPedidos = [];

function inView(p,view){
  if(view==='cobrados')return p.estado==='pagado';
  if(p.estado!=='pendiente'||p.total<=0)return false;
  if(!FLOW_PREVIEW)return true;
  return view==='abiertas'?p.tipo==='salon'&&!p.cuentaSolicitada:p.tipo!=='salon'||p.cuentaSolicitada;
}

export default function CajaPage() {
  const { data, loading, error: errorConsulta, retry: recargar } =
    useOrderResource(cajaService.getPedidos, { events: eventosCaja, update: cajaService.actualizarPedidos });
  const pedidos = data || sinPedidos;
  const actualizarPedido = id => recargar([{ pedidoId: id }]);
  const fechaResumen = useFechaLima();
  const cargarResumen = useCallback(() => cajaService.getResumenDia(fechaResumen), [fechaResumen]);
  const { data: resumenServidor, error: errorResumen, retry: recargarResumen } =
    useOrderResource(cargarResumen, { events: eventosResumen });
  const [seleccionadoId, setSeleccionadoId] = useState(null);
  const [busqueda, setBusqueda] = useState("");
  const [vista, setVista] = useState("pendientes");
  const [borradorPago, setBorradorPago] = useState(null);
  const [ventaConfirmada, setVentaConfirmada] = useState(null);
  const [abriendoComprobante, setAbriendoComprobante] = useState(false);
  const [revisando, setRevisando] = useState(false);
  const cargando = loading || revisando;
  const [errorOperacion, setError] = useState("");
  const error = errorOperacion || errorConsulta || errorResumen;
  const [cobrando, setCobrando] = useState(false);
  const [entregando, setEntregando] = useState(false);
  const [reintentoPendiente, setReintentoPendiente] = useState(false);
  const [pedidoEnCobro, setPedidoEnCobro] = useState(null);
  const [filtroTipo,setFiltroTipo]=useState('todos'),[filtroCocina,setFiltroCocina]=useState('todos'),[fechaCobro,setFechaCobro]=useState(''),[soloReparto,setSoloReparto]=useState(false),[anticipado,setAnticipado]=useState(false);
  const intento = useRef(null);
  const bloqueo = useRef(false);
  const detalle = useRef(null);
  const montado = useRef(false);
  useEffect(() => {
    montado.current = true;
    return () => { montado.current = false; };
  }, []);

  const pendientes = pedidos.filter(p=>inView(p,'pendientes'));
  const abiertas=FLOW_PREVIEW?pedidos.filter(p=>inView(p,'abiertas')):[];
  const cobrados = pedidos.filter((pedido) => pedido.estado === "pagado");
  const listaActiva = vista === "pendientes" ? pendientes : vista==='abiertas'?abiertas:cobrados;

  const pedidosFiltrados = listaActiva.filter((pedido) =>
    `${pedido.codigo} ${formatCodigoPedido(pedido.codigo || pedido.id)} ${pedido.mesa || pedido.tipo} ${pedido.cliente}`
      .toLowerCase()
      .includes(busqueda.trim().toLowerCase())&&(!FLOW_PREVIEW||((filtroTipo==='todos'||pedido.tipo===filtroTipo)&&(filtroCocina==='todos'||pedido.estadoCocina===filtroCocina)&&(!fechaCobro||vista!=='cobrados'||fechaLima(pedido.pagadoAt)===fechaCobro)&&(!soloReparto||pedido.tipo==='delivery'&&pedido.estadoPedido==='en_camino')))
  );

  const pedidoActivo = pedidoEnCobro ?? listaActiva.find(pedido => pedido.id === seleccionadoId) ?? listaActiva[0] ?? null;
  const total = pedidoActivo ? cajaService.calcularTotal(pedidoActivo) : 0;
  const metodoSugerido = pedidoActivo?.metodoSolicitado || "Efectivo";
  const borrador = borradorPago?.pedidoId === pedidoActivo?.id && borradorPago?.metodoSugerido === metodoSugerido
    ? borradorPago : null;
  const metodo = borrador?.metodo ?? metodoSugerido;
  const monto = borrador?.monto ?? (metodo === "Efectivo" ? "" : total.toFixed(2));
  const modificarMetodo = borrador?.modificarMetodo ?? false;
  const montoNumerico = Number(monto);
  const montoValido = monto !== "" && /^\d+(\.\d{1,2})?$/.test(monto) && Number.isFinite(montoNumerico) && montoNumerico > 0;
  const puedeCobrar = Boolean(
    pedidoActivo &&
      pedidoActivo.estado === "pendiente" && total > 0 && !cargando && !cobrando && !entregando &&
      (!FLOW_PREVIEW||(!openIncident(pedidoActivo.cuenta||{})&&(pedidoActivo.tipo!=='salon'||pedidoActivo.cuentaSolicitada||anticipado)))&&
      (metodo !== "Efectivo" || (montoValido && montoNumerico >= total))
  );

  const resumen = useMemo(() => ({
    ...calcularResumenCaja(pedidos, fechaResumen),
    ...resumenServidor,
  }), [pedidos, fechaResumen, resumenServidor]);

  function editarPago(cambios) {
    setBorradorPago({ pedidoId: pedidoActivo?.id, metodoSugerido, metodo, monto, modificarMetodo, ...cambios });
  }

  function handleToggleModificarMetodo(checked) {
    if (bloqueo.current || intento.current) return;
    editarPago(checked ? { modificarMetodo: true } : {
      modificarMetodo: false,
      metodo: metodoSugerido,
      monto: metodoSugerido === "Efectivo" ? "" : total.toFixed(2),
    });
  }

  function cambiarVista(nuevaVista) {
    if (bloqueo.current || intento.current) return;
    const nuevaLista = nuevaVista === "pendientes" ? pendientes : nuevaVista==='abiertas'?abiertas:cobrados;
    setVista(nuevaVista);
    setBusqueda("");
    setSeleccionadoId(nuevaLista[0]?.id ?? null);
    setBorradorPago(null);
    setAnticipado(false);setSoloReparto(false);setFechaCobro('');
  }

  function cambiarMetodo(nuevoMetodo) {
    if (bloqueo.current || intento.current) return;
    editarPago({ metodo: nuevoMetodo, monto: nuevoMetodo === "Efectivo" ? "" : total.toFixed(2) });
  }

  async function confirmarVenta() {
    if (!puedeCobrar || bloqueo.current) return;
    bloqueo.current = true;
    setCobrando(true);
    setError("");
    setPedidoEnCobro(pedidoActivo);
    intento.current ??= { id: pedidoActivo.id, data: {
      metodo, monto: metodo === "Efectivo" ? montoNumerico : total,
      idempotencia: crypto.randomUUID(), totalEsperado: total,
      version:pedidoActivo?.versionCuenta,anticipado,
    } };
    try {
      const pedidoPagado = await cajaService.registrarCobro(intento.current.id, intento.current.data);
      if (!montado.current) return;
      setVentaConfirmada(pedidoPagado);
      intento.current = null;
      setReintentoPendiente(false);
      await Promise.all([actualizarPedido(pedidoPagado.id), recargarResumen()]);
      if (montado.current) setPedidoEnCobro(null);
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
    await actualizarPedido(pedidoActivo.id);
  }

  function cerrarTicket() {
    const primerPendiente = pendientes[0];
    setVentaConfirmada(null);
    setVista("pendientes");
    setSeleccionadoId(primerPendiente?.id ?? null);
  }

  async function revisarCuenta() {
    if (bloqueo.current) return;
    intento.current = null;
    setReintentoPendiente(false);
    setPedidoEnCobro(null);
    setBorradorPago(null);
    setError("");
    setRevisando(true);
    try { await Promise.all([recargar(), recargarResumen()]); } finally { if (montado.current) setRevisando(false); }
  }
  async function abrirComprobante() {
    setError("");
    setAbriendoComprobante(true);
    try {
      const pedido = await cajaService.getPedidoPorId(pedidoActivo.id);
      if (montado.current && pedido?.pago) setVentaConfirmada(pedido);
    } catch (err) {
      if (montado.current) setError(err.message || "No se pudo consultar el comprobante.");
    } finally {
      if (montado.current) setAbriendoComprobante(false);
    }
  }

  async function gestionarIncidencia(action,cuenta,extra={}){
    if(bloqueo.current||intento.current)return;bloqueo.current=true;setEntregando(true);setError('');
    let fallo='';
    try{return await operateFlow(action,{pedido:cuenta.id,version:cuenta.version_cuenta,...extra});}
    catch(err){fallo=err.message||'No se pudo registrar la incidencia.';throw err;}
    finally{await actualizarPedido(cuenta.id);bloqueo.current=false;if(montado.current){if(fallo)setError(fallo);setEntregando(false);}}
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
          <section
            className={vista === "cobrados" ? "caja-orders-panel caja-orders-panel--history" : "caja-orders-panel"}
            aria-labelledby="pedidos-title"
          >
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
              pedidoSeleccionado={pedidoActivo?.id}
              disabled={entregando || cobrando || reintentoPendiente}
              onSeleccionar={(id) => {
                setSeleccionadoId(id);
                setBorradorPago(null);
                setAnticipado(false);
                if (window.matchMedia("(max-width: 980px)").matches) {
                  detalle.current?.focus({ preventScroll: true });
                  detalle.current?.scrollIntoView({ block: "start" });
                }
              }}
            />
          </section>

          <section ref={detalle} tabIndex={-1} className="caja-payment-panel" aria-label="Cobro del pedido">
            <DetalleVenta pedido={pedidoActivo} />
            {FLOW_PREVIEW&&pedidoActivo&&<p className="attention-status">Cocina: {pedidoActivo.estadoCocina} · Cuenta: {pedidoActivo.estado==='pagado'?'Pagada':pedidoActivo.cuentaSolicitada?'Solicitada':'Abierta'} · Pago: {pedidoActivo.estado==='pagado'?'Confirmado':'Pendiente'}</p>}
            {FLOW_PREVIEW&&pedidoActivo?.estado==='pendiente'&&pedidoActivo.tipo==='salon'&&!pedidoActivo.cuentaSolicitada&&<div className="attention-caja-notice"><label className="attention-confirm"><input type="checkbox" checked={anticipado} disabled={cobrando||reintentoPendiente} onChange={e=>setAnticipado(e.target.checked)}/>Confirmo el cobro anticipado.</label><p>La mesa seguirá ocupada y los platos pendientes continuarán en cocina. Los consumos posteriores irán a una cuenta adicional.</p></div>}
            {pedidoActivo && (
              <div className="caja-order-actions">
                {FLOW_PREVIEW && pedidoActivo.cuenta && (
                  <IncidentActions
                    cuenta={pedidoActivo.cuenta}
                    flow={{ busy: entregando || cobrando || reintentoPendiente, act: gestionarIncidencia }}
                  />
                )}
                {pedidoActivo.tipo === "delivery" && pedidoActivo.estadoPedido === "en_camino" && (
                  <>
                    <p role="status" className="caja-delivery-note">
                      En camino. {pedidoActivo.estado === "pagado"
                        ? "Confirma cuando el repartidor entregue al cliente."
                        : "Registra el cobro recibido antes de confirmar la entrega al cliente."}
                    </p>
                    {pedidoActivo.estado === "pagado" && (
                      <button
                        type="button"
                        className="caja-order-action caja-order-action--delivery"
                        disabled={entregando || cobrando || reintentoPendiente}
                        onClick={confirmarEntregaDelivery}
                      >
                        {entregando ? "Confirmando entrega…" : "Confirmar entrega al cliente"}
                      </button>
                    )}
                  </>
                )}
                {pedidoActivo.estado === "pagado" && pedidoActivo.pago && (
                  <button
                    type="button"
                    className="caja-order-action caja-order-action--receipt"
                    onClick={abrirComprobante}
                    disabled={abriendoComprobante}
                  >
                    Ver comprobante
                  </button>
                )}
              </div>
            )}

            {pedidoActivo?.estado === "pendiente" && (
              <>
                <FormularioPago
                  metodo={metodo}
                  onMetodoChange={cambiarMetodo}
                  monto={monto}
                  onMontoChange={monto => editarPago({ monto })}
                  total={total}
                  disabled={entregando || cobrando || reintentoPendiente}
                  metodoSolicitado={pedidoActivo.metodoSolicitado}
                  puedeModificarMetodo={modificarMetodo}
                  onToggleModificarMetodo={handleToggleModificarMetodo}
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
