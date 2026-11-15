import { useCallback, useState } from 'react'
import { ArrowLeft, Check, Copy } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import orderService from '../services/orderService'
import OrderStateHistory from '../components/orders/OrderStateHistory'
import useOrderResource from '../hooks/useOrderResource'
import { money } from '../utils/currency'
import { formatCodigoPedido } from '../utils/orderNumber'
import OrderDeliveryInfo from '../components/orders/OrderDeliveryInfo'
import OrderStatusBadge from '../components/orders/OrderStatusBadge'
import OrderStatusStepper from '../components/orders/OrderStatusStepper'
import '../styles/pedidos.css'

export default function OrderDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const load = useCallback(() => orderService.getOrderById(id), [id])
  const { data: order, loading, error, retry } = useOrderResource(load)
  const [copied, setCopied] = useState(false)

  if (loading) return <p role="status">Cargando pedido...</p>;
  if (error) return <div><p role="alert">{error}</p><button className="btn-outline" onClick={retry}>Reintentar pedido</button></div>;
  if (!order) {
    return (
      <section className="orders-page">
        <p>No encontramos ese pedido.</p>
        <Link to="/pedidos" className="btn-ember">
          Volver a mis pedidos
        </Link>
      </section>
    )
  }

  const date = new Date(order.createdAt).toLocaleString('es-PE', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })

  function handleCopy() {
    navigator.clipboard.writeText(formatCodigoPedido(order.id)).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <section className="orders-page">
      <button onClick={() => navigate('/pedidos')} className="lys-navlink order-detail-back">
        <ArrowLeft size={15} /> Mis pedidos
      </button>

      <div className="order-detail-header">
        <div>
          <h1 className="font-display order-detail-id" title={order.id}>
            {formatCodigoPedido(order.id)}
            <button
              className="copy-id-btn"
              onClick={handleCopy}
              aria-label="Copiar número de pedido"
              title="Copiar número de pedido"
            >
              {copied ? <Check size={16} color="#2E7D46" /> : <Copy size={16} />}
            </button>
          </h1>
          <p className="order-card-date">{date}</p>
        </div>
        <OrderStatusBadge order={order} />
      </div>

      <OrderStatusStepper order={order} />

      <div className="order-items-card">
        <div className="order-items-card-title font-mono">COMANDA · LEÑA Y SABORES</div>
        <div className="order-items-card-body">
          {order.items.map((item) => (
            <div key={item.id} className="order-item-row font-mono">
              <span>
                {item.qty}× {item.name}
              </span>
              <span>{money(item.qty * item.price)}</span>
            </div>
          ))}
          <div className="order-item-row font-mono subtotal">
            <span>Subtotal</span>
            <span>{money(order.subtotal)}</span>
          </div>
          <div className="order-item-row font-mono subtotal">
            <span>Envío ({order.deliveryType === 'delivery' ? 'delivery' : 'recojo en tienda'})</span>
            <span>{order.shipping === 0 ? 'Gratis' : money(order.shipping)}</span>
          </div>
          <div className="order-item-row font-mono total">
            <span>TOTAL</span>
            <span>{money(order.total)}</span>
          </div>
        </div>
      </div>
      <OrderDeliveryInfo order={order} />
      <OrderStateHistory key={id} orderId={id} />
    </section>
  )
}
