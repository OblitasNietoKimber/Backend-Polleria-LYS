import { IconoCelular, IconoDocumento, IconoEfectivo, IconoTarjeta } from "../common/Iconos";
import { formatCodigoPedido } from "../../utils/orderNumber";

const formatoSoles = new Intl.NumberFormat("es-PE", {
  style: "currency",
  currency: "PEN",
});

function iconoMetodo(metodo) {
  if (metodo === "Tarjeta") return <IconoTarjeta size={15} color="var(--char)" />;
  if (metodo === "Efectivo") return <IconoEfectivo size={15} color="var(--ember)" />;
  return <IconoCelular size={15} color="#8A2BE2" />;
}

export default function HistorialVentas({ ventas = [], haySiguiente = false, cargandoMas = false, onCargarMas }) {
  return (
    <section className="ticket-card admin-history-card">
      <div className="admin-block-title">
        <IconoDocumento size={18} color="var(--ember)" />
        <span className="font-display">Historial de ventas</span>
      </div>

      <div className="admin-table-wrap">
        <table className="admin-history-table">
          <thead>
            <tr>
              <th>Pedido</th>
              <th>Cliente</th>
              <th>Mesa / Tipo</th>
              <th>Total</th>
              <th>Metodo</th>
              <th>Fecha</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {ventas.length === 0 ? (
              <tr>
                <td colSpan="7" className="admin-empty-cell">No hay ventas pagadas registradas.</td>
              </tr>
            ) : ventas.map((venta) => {
              const fechaVenta = new Date(venta.pagadoAt || venta.createdAt);
              const metodo = venta.pago?.metodo || "Sin metodo";

              return (
              <tr key={venta.pagoId || venta.id}>
                <td className="font-mono admin-strong-cell" title={venta.codigo || venta.id}>
                  {formatCodigoPedido(venta.codigo || venta.id)}
                </td>
                <td className="admin-strong-cell">{venta.cliente}</td>
                <td className="admin-muted-cell">{venta.mesa ? `Mesa ${venta.mesa}` : venta.tipo}</td>
                <td className="font-mono admin-strong-cell">{formatoSoles.format(venta.total)}</td>
                <td>
                  <div className="admin-method-cell">
                    {iconoMetodo(metodo)}
                    <span>{metodo}</span>
                  </div>
                </td>
                <td className="font-mono admin-time-cell">
                  {fechaVenta.toLocaleString("es-PE", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                </td>
                <td>
                  <span className="step-stub done admin-status-badge">Completado</span>
                </td>
              </tr>
            );
            })}
          </tbody>
        </table>
      </div>

      {haySiguiente && (
        <button type="button" className="admin-filtro-limpiar admin-history-more" onClick={onCargarMas} disabled={cargandoMas}>
          {cargandoMas ? "Cargando…" : "Ver más ventas"}
        </button>
      )}
    </section>
  );
}
