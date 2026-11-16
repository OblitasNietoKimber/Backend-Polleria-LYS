import { Clock, Play, ChefHat, CheckCircle2 } from "lucide-react";
import { useTiempoTranscurrido } from "../../hooks/useTiempoTranscurrido";
import { formatCodigoPedido } from "../../utils/orderNumber";
import {openIncident} from '../../services/atencionService';
import {IncidentActions} from '../flow/FlowShared';

const ESTADO_CLASE = {
  nuevo: "cocina-card--nuevo",
  en_preparacion: "cocina-card--preparacion",
  listo: "cocina-card--listo",
};

const TIPO_LABEL = {
  salon: "Salón",
  delivery: "Delivery",
  recojo: "Para llevar",
};

export default function TarjetaPedidoCocina({ pedido, onCambiarEstado, onIncidencia, actualizando = false }) {
  const { texto: tiempo } = useTiempoTranscurrido(pedido.createdAt, pedido.finalizadoAt);
  const tipo = pedido.tipo || "salon";
  const incidencia=pedido.cuenta&&openIncident(pedido.cuenta);
  const pendienteCobro = pedido.estadoPago !== 'pagado' &&
    (tipo === 'recojo' || (tipo === 'delivery' && pedido.metodoSolicitado !== 'efectivo'));

  return (
    <div className={`cocina-card ${ESTADO_CLASE[pedido.estadoCocina] || ""}`}>
      <div className="cocina-card-top">
        <span className="cocina-codigo" title={pedido.id}>
          {formatCodigoPedido(pedido.id)}
        </span>
        <div className="cocina-card-top-right">
          {pedido.mesa && <span className="cocina-mesa-texto">Mesa {pedido.mesa}</span>}
          <span className={`cocina-tipo-badge cocina-tipo-badge--${tipo}`}>
            {TIPO_LABEL[tipo] || "Salón"}
          </span>
        </div>
      </div>

      <div className="cocina-timer">
        <Clock size={13} /> {tiempo}
      </div>

      {pedido.observaciones && <p className="cocina-obs-general">Obs: {pedido.observaciones}</p>}

      <ul className="cocina-items">
        {pedido.items.map((item, i) => (
          <li key={i}>
            <span className="cocina-cant">{item.cantidad}x</span>
            <span>
              {item.nombre}
              {item.observacion && <span className="cocina-obs-item"> — {item.observacion}</span>}
            </span>
          </li>
        ))}
      </ul>

      {!incidencia&&pedido.estadoCocina === "nuevo" && (
        <button className="cocina-btn cocina-btn--iniciar" disabled={actualizando} onClick={() => onCambiarEstado(pedido, "en_preparacion")}>
          <Play size={14} /> Comenzar
        </button>
      )}
      {!incidencia&&pedido.estadoCocina === "en_preparacion" && (
        <button className="cocina-btn cocina-btn--listo" disabled={actualizando} onClick={() => onCambiarEstado(pedido, "listo")}>
          <ChefHat size={14} /> Marcar listo
        </button>
      )}
      {!incidencia&&pedido.estadoCocina === "listo" && (
        <>
          <p className="cocina-auditoria">
            {pendienteCobro ? 'Pendiente de cobro. Confirma el pago en caja antes de entregar.'
              : tipo === 'delivery' ? 'Entrega al repartidor. El pedido pasará a En camino.'
                : tipo === 'salon' ? 'Entrega a la mesera. La cuenta se cobra en caja.' : 'Entrega al cliente. Pago confirmado.'}
          </p>
          {pedido.entregaDisponible === false && <p role="status">La entrega de cocina aún no está habilitada en el servidor.</p>}
          <button className="cocina-btn cocina-btn--entregar" disabled={actualizando || pendienteCobro || pedido.entregaDisponible === false}
            onClick={() => onCambiarEstado(pedido, "entregado")}>
            <CheckCircle2 size={14} /> {actualizando ? 'Entregando…' : 'Entregar'}
          </button>
        </>
      )}
      {incidencia&&<IncidentActions cuenta={pedido.cuenta} flow={{busy:actualizando,act:onIncidencia}}/>}
    </div>
  );
}
