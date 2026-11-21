import orderService, { ORDER_STATUS_STEPS } from '../../services/orderService'

export default function OrderStatusBadge({ order }) {
  const status = orderService.getOrderStatus(order)
  const label = ORDER_STATUS_STEPS.find((s) => s.key === status)?.label || (status === 'cancelado' ? 'Cancelado' : 'Pendiente')

  return (
    <span className={`status-badge status-${status}`}>
      <span className="status-dot" />
      {label}
    </span>
  )
}   