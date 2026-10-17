import { useCallback, useEffect, useRef, useState } from "react";
import dashboardService from "../services/dashboardService";
import FiltroFechas from "../components/admin/FiltroFechas";
import MetricasOperativas from "../components/admin/MetricasOperativas";
import ProductosTop from "../components/admin/ProductosTop";
import HistorialVentas from "../components/admin/HistorialVentas";
import TarjetasResumen from "../components/admin/TarjetasResumen";
import Ventas7Dias from "../components/admin/Ventas7Dias";
import VentasMetodoPago from "../components/admin/VentasMetodoPago";

export default function DashboardAdminPage() {
  const [filtros, setFiltros] = useState({ fechaInicio: "", fechaFin: "" });
  const [datos, setDatos] = useState(null);
  const [historial, setHistorial] = useState({ ventas: [], siguiente: null });
  const [cargando, setCargando] = useState(true);
  const [cargandoMas, setCargandoMas] = useState(false);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const filtrosActuales = useRef(filtros);
  const actualizar = useCallback(() => setRevision(valor => valor + 1), []);
  useEffect(() => {
    let activo = true, consultando = false, clave = null;
    filtrosActuales.current = filtros;
    async function cargar() {
      if (consultando || document.visibilityState === 'hidden') return;
      consultando = true;
      try {
        // El cambio de fecha también renueva las ventas del día aunque no haya cobros nuevos.
        const cambios = `${await dashboardService.getSelloCambios()}|${new Date().toDateString()}`;
        if (cambios === clave) { if (activo) setError(""); return; }
        const [dashboard, pagina] = await Promise.all([
          dashboardService.getDashboard(filtros),
          dashboardService.getHistorialVentas(filtros),
        ]);
        clave = cambios;
        if (activo) { setDatos(dashboard); setHistorial(pagina); setError(""); }
      } catch (err) {
        if (activo) setError(err.message || "No se pudo consultar las ventas.");
      } finally {
        consultando = false;
        if (activo) setCargando(false);
      }
    }
    cargar();
    const timer = setInterval(cargar, 10000);
    document.addEventListener('visibilitychange', cargar);
    return () => { activo = false; clearInterval(timer); document.removeEventListener('visibilitychange', cargar); };
  }, [filtros, revision]);

  const cargarMas = async () => {
    const consulta = filtrosActuales.current;
    setCargandoMas(true);
    try {
      const pagina = await dashboardService.getHistorialVentas(consulta, { siguiente: historial.siguiente });
      if (filtrosActuales.current !== consulta) return;
      setHistorial(actual => ({ ventas: [...actual.ventas, ...pagina.ventas], siguiente: pagina.siguiente }));
    } catch (err) {
      setError(err.message || "No se pudo consultar el historial de ventas.");
    } finally {
      setCargandoMas(false);
    }
  };

  const cambiarFiltros = (nuevos) => { setCargando(true); setFiltros(nuevos); };
  const limpiarFiltros = () => cambiarFiltros({ fechaInicio: "", fechaFin: "" });

  return (
    <div className="lys-root admin-screen">
      <main className="admin-content">
        <section className="admin-page-head">
          <div>
            <h1>DASHBOARD</h1>
            <p>Resumen general de tu restaurante</p>
          </div>

          <FiltroFechas filtros={filtros} onCambiar={cambiarFiltros} onLimpiar={limpiarFiltros} />
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
          <HistorialVentas ventas={historial.ventas} haySiguiente={Boolean(historial.siguiente)}
            cargandoMas={cargandoMas} onCargarMas={cargarMas} />
        </section>
      </main>
    </div>
  );
}
