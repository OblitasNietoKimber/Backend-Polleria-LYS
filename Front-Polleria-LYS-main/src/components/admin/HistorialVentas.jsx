import { IconoCelular, IconoDocumento, IconoEfectivo, IconoTarjeta } from "../common/Iconos";
import { formatCodigoPedido } from "../../utils/orderNumber";
import { obtenerColorMetodo } from "./VentasMetodoPago";

const formatoSoles = new Intl.NumberFormat("es-PE", {
  style: "currency",
  currency: "PEN",
});

function iconoMetodo(metodo) {
  const norm = String(metodo).toLowerCase();
  if (norm.includes("tarjeta")) return <IconoTarjeta size={15} color="#2563EB" />;
  if (norm.includes("efectivo")) return <IconoEfectivo size={15} color="#2E7D32" />;
  if (norm.includes("plin")) return <IconoCelular size={15} color="#00D4A0" />;
  if (norm.includes("yape")) return <IconoCelular size={15} color="#742284" />;
  return <IconoCelular size={15} color="#8A2BE2" />;
}

export default function HistorialVentas({ ventas = [] }) {
  return (
    <section className="ticket-card admin-history-card">
      <div className="admin-block-title">
        <IconoDocumento size={18} color="var(--ember)" />
        <span className="font-display">Historial de ventas</span>
      </div>

      <div className="admin-table-wrap" tabIndex={0} aria-label="Historial de ventas con desplazamiento horizontal">
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
              const color = obtenerColorMetodo(metodo);

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
                    <span style={{ color, fontWeight: 600 }}>{metodo}</span>
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
    </section>
  );
}
