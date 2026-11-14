import { IconoTarjeta } from "../common/Iconos";
import EChart from "./EChart";

export function obtenerColorMetodo(nombre = "") {
  const norm = String(nombre).toLowerCase().trim();
  if (norm.includes("yape")) return "#742284"; // Morado oficial Yape
  if (norm.includes("plin")) return "#00D4A0"; // Verde/Turquesa oficial Plin
  if (norm.includes("efectivo")) return "#2E7D32"; // Verde Efectivo
  if (norm.includes("tarjeta")) return "#2563EB"; // Azul Tarjeta
  return "#D97706"; // Ámbar por defecto
}

const formatoSoles = new Intl.NumberFormat("es-PE", {
  style: "currency",
  currency: "PEN",
});

function normalizarMetodos(metodos = []) {
  const totalGeneral = metodos.reduce((acc, item) => acc + item.total, 0);

  return metodos.map((item, index) => {
    const color = item.color || obtenerColorMetodo(item.nombre);
    return {
      ...item,
      color,
      colorIndex: index,
      monto: formatoSoles.format(item.total),
      porcentaje: totalGeneral ? `${Math.round((item.total / totalGeneral) * 100)}%` : "0%",
    };
  });
}

function crearDonutOption(metodosPago) {
  return {
    animationDuration: 800,
    tooltip: {
      trigger: "item",
      confine: true,
      formatter: "{b}<br/>{d}%",
    },
    series: [
      {
        name: "Metodo de pago",
        type: "pie",
        radius: ["58%", "78%"],
        center: ["50%", "50%"],
        avoidLabelOverlap: true,
        label: { show: false },
        labelLine: { show: false },
        data: metodosPago.length
          ? metodosPago.map((item) => ({
              name: item.nombre,
              value: item.total,
              itemStyle: { color: item.color },
            }))
          : [{ name: "Sin ventas", value: 1, itemStyle: { color: "#E7E2DA" } }],
        emphasis: {
          scale: true,
          scaleSize: 5,
          itemStyle: {
            shadowBlur: 12,
            shadowColor: "rgba(27, 21, 18, 0.18)",
          },
        },
      },
    ],
  };
}

export default function VentasMetodoPago({ metodos = [] }) {
  const metodosPago = normalizarMetodos(metodos);
  const total = metodos.reduce((acc, item) => acc + item.total, 0);

  return (
    <section className="ticket-card admin-payment-card">
      <div className="admin-block-title">
        <IconoTarjeta size={18} color="var(--ember)" />
        <span className="font-display">Ventas por metodo de pago</span>
      </div>

      <div className="admin-payment-content">
        <div className="admin-donut-wrap">
          <EChart
            className="admin-donut"
            option={crearDonutOption(metodosPago)}
            ariaLabel="Grafico de ventas por metodo de pago"
          />

          <div className="admin-donut-center">
            <span>Total</span>
            <strong className="font-mono">{formatoSoles.format(total)}</strong>
          </div>
        </div>

        <div className="admin-payment-list">
          {metodosPago.length === 0 ? (
            <p className="admin-empty-text">No hay ventas pagadas registradas.</p>
          ) : metodosPago.map((item) => (
            <div className="admin-payment-row" key={item.nombre}>
              <div className="admin-payment-left">
                <span className="admin-color-dot" style={{ backgroundColor: item.color }} />
                <span>{item.nombre}</span>
              </div>

              <div className="admin-payment-values">
                <strong className="font-mono">{item.porcentaje}</strong>
                <span className="font-mono">{item.monto}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
