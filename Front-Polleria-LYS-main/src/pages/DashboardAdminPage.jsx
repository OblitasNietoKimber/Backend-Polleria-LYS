import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import useOrderResource from '../hooks/useOrderResource';
import useFechaLima from '../hooks/useFechaLima';
import { ORDER_EVENT, PAYMENT_EVENT } from '../services/orderUpdates';
import { FLOW_PREVIEW } from '../services/atencionService';
const FlowReturnsSummary = lazy(() => import('../components/flow/FlowReturnsSummary'));
import { Link } from "react-router-dom";
import { UtensilsCrossed } from "lucide-react";
import dashboardService from "../services/dashboardService";
import FiltroFechas from "../components/admin/FiltroFechas";
import MetricasOperativas from "../components/admin/MetricasOperativas";
import ProductosTop from "../components/admin/ProductosTop";
import HistorialVentas from "../components/admin/HistorialVentas";
import TarjetasResumen from "../components/admin/TarjetasResumen";
import Ventas7Dias from "../components/admin/Ventas7Dias";
import VentasMetodoPago from "../components/admin/VentasMetodoPago";
import AdminNavTabs from "../components/admin/AdminNavTabs";
import "../styles/dashboard.css";

const eventosMetricas = [ORDER_EVENT, PAYMENT_EVENT];
const eventosVentas = [PAYMENT_EVENT];

export default function DashboardAdminPage() {
  const [filtros, setFiltros] = useState({ fechaInicio: "", fechaFin: "" });
  const [paginasExtra, setPaginasExtra] = useState(null);
  const [cargandoMas, setCargandoMas] = useState(false);
  const [errorPagina, setErrorPagina] = useState("");
  const [revision, setRevision] = useState(0);
  const filtrosActuales = useRef(filtros);
  const loadDashboard = useCallback(() => dashboardService.getDashboard(filtros), [filtros]);
  const loadHistorial = useCallback(() => dashboardService.getHistorialVentas(filtros), [filtros]);
  const { data: datos, loading: cargando, error: errorMetricas, retry: recargarMetricas } =
    useOrderResource(loadDashboard, { events: eventosMetricas });
  const { data: primeraPagina, error: errorHistorial, retry: recargarHistorial } =
    useOrderResource(loadHistorial, { events: eventosVentas });
  const historial = paginasExtra?.base === primeraPagina ? paginasExtra : primeraPagina;
  const error = errorPagina || errorMetricas || errorHistorial;

  const fechaOperativa = useFechaLima();
  const ultimaFecha = useRef(fechaOperativa);
  useEffect(() => {
    if (ultimaFecha.current === fechaOperativa) return;
    ultimaFecha.current = fechaOperativa;
    void recargarMetricas();
  }, [fechaOperativa, recargarMetricas]);

  function actualizar() {
    setErrorPagina("");
    setRevision(valor => valor + 1);
    void recargarMetricas();
    void recargarHistorial();
  }

  const cargarMas = async () => {
    if (!historial?.siguiente || cargandoMas) return;
    const consulta = filtrosActuales.current;
    setCargandoMas(true);
    setErrorPagina("");
    try {
      const pagina = await dashboardService.getHistorialVentas(consulta, { siguiente: historial.siguiente });
      if (filtrosActuales.current !== consulta) return;
      setPaginasExtra({ base: primeraPagina, ventas: [...historial.ventas, ...pagina.ventas], siguiente: pagina.siguiente });
    } catch (err) {
      if (filtrosActuales.current === consulta) setErrorPagina(err.message || "No se pudo consultar el historial de ventas.");
    } finally {
      setCargandoMas(false);
    }
  };

  const cambiarFiltros = nuevos => {
    filtrosActuales.current = nuevos;
    setErrorPagina("");
    setFiltros(nuevos);
  };
  const limpiarFiltros = () => cambiarFiltros({ fechaInicio: "", fechaFin: "" });

  return (
    <div className="lys-root admin-screen">
      <main className="admin-content">
        <AdminNavTabs />
        {FLOW_PREVIEW && <Suspense fallback={null}><FlowReturnsSummary key={revision} filters={filtros} /></Suspense>}
        <section className="admin-page-head">
          <div>
            <h1>DASHBOARD</h1>
            <p>Resumen general de tu restaurante</p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <Link
              to="/admin/productos"
              className="btn-outline"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '0.88rem',
                padding: '10px 16px',
                borderRadius: '6px',
                textDecoration: 'none',
              }}
            >
              <UtensilsCrossed size={16} />
              <span>Gestionar Productos</span>
            </Link>
            <FiltroFechas filtros={filtros} onCambiar={cambiarFiltros} onLimpiar={limpiarFiltros} />
          </div>
        </section>

        {cargando && <p role="status">Consultando ventas…</p>}
        {error && <div role="alert">{error}<button type="button" onClick={actualizar}>Reintentar</button></div>}
        <TarjetasResumen resumen={datos?.resumen} tendencias={datos?.tendencias} />
        <MetricasOperativas resumen={datos?.resumen} pedidosPendientes={datos?.pedidosPendientes} tendencias={datos?.operativas} />

        <section className="admin-double-grid">
          <VentasMetodoPago metodos={datos?.metodosPago} />
          <ProductosTop productos={datos?.productos} />
        </section>

        <section className="admin-double-grid">
          <Ventas7Dias ventas={datos?.ventasPorDia} />
          <HistorialVentas ventas={historial?.ventas || []} siguiente={historial?.siguiente} cargandoMas={cargandoMas} onCargarMas={cargarMas} />
        </section>
      </main>
    </div>
  );
}
