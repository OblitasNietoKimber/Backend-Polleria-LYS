import { useTiempoTranscurrido } from "../../hooks/useTiempoTranscurrido";

function FilaPedido({ pedido }) {
  const { texto: duracion } = useTiempoTranscurrido(pedido.createdAt, pedido.finalizadoAt || pedido.createdAt);

  return (
    <div className="cocina-finalizado-item">
      <div>
        <span className="cocina-finalizado-id">{pedido.id}</span>
        <span className="cocina-id cocina-finalizado-cliente">{pedido.cliente}</span>
      </div>
      <div className="cocina-finalizado-meta">
        <span>{pedido.cambiadoPor ? 'Usuario: ' + pedido.cambiadoPor : 'Usuario sin registro'}</span>
        <span className="font-mono cocina-finalizado-duracion">{pedido.finalizadoAt ? 'Preparación: ' + duracion : 'Preparación sin fecha confirmada'}</span>
        <span className="font-mono cocina-finalizado-hora">
          {pedido.finalizadoAt ? new Date(pedido.finalizadoAt).toLocaleTimeString() : "Fecha no disponible"}
        </span>
      </div>
    </div>
  );
}

export default function PedidosFinalizados({ pedidos }) {
  if (pedidos.length === 0) {
    return <p className="cocina-empty">Aún no hay pedidos aquí.</p>;
  }

  return (
    <div className="cocina-finalizados-list">
      {pedidos.map((p) => (
        <FilaPedido key={p.id} pedido={p} />
      ))}
    </div>
  );
}
