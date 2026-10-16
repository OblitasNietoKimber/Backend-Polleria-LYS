import { Link } from 'react-router-dom'
import { CheckCircle2 } from 'lucide-react'

export default function OrderConfirmation({ name, orderNumber, onReset }) {
  return (
    <section className="order-confirmation">
      <CheckCircle2 size={54} color="var(--ember)" strokeWidth={1.5} className="order-confirmation-icon" />
      <h1 className="font-display order-confirmation-title">¡Pedido confirmado!</h1>
      <p className="order-confirmation-text">
        Gracias, {name || 'cliente'}. Recibimos tu pedido. Puedes consultar su estado y detalle.
      </p>
      <div className="font-mono order-confirmation-ticket">
        <div className="order-confirmation-ticket-label">NÚMERO DE PEDIDO</div>
        <div className="order-confirmation-ticket-number">{orderNumber}</div>
      </div>
      <div className="order-confirmation-actions">
        {orderNumber && <Link className="btn-outline" to={`/pedidos/${orderNumber}`}>Ver mi pedido</Link>}
        <button className="btn-ember" onClick={onReset}>
          Volver al inicio
        </button>
      </div>
    </section>
  )
}
