import { AlertTriangle } from 'lucide-react'
import { formatCodigoPedido } from '../utils/orderNumber'

export default function OrderSummary({ items, subtotal, shipping, total, deliveryType, form, payment, cardReceipt, money, onBack, onConfirm, saving = false, blocked = false, unpaidOrder = null }) {
  // Desglosar el impuesto incluido en productos y envío sin alterar el cobro.
  const totalCentimos = Math.round(total * 100)
  const baseCentimos = Math.round(totalCentimos / 1.18)
  const igv = (totalCentimos - baseCentimos) / 100

  return (
    <div>
      <h2 className="font-display checkout-form-title">Resumen de tu compra</h2>
      <div className="order-ticket">
        <div className="order-ticket-header">COMANDA · LEÑAS &amp; SABORES</div>
        <div className="order-ticket-body">
          {items.map(({ product, qty }) => (
            <div key={product.id} className="font-mono order-ticket-line">
              <span>
                {qty}× {product.name}
              </span>
              <span>{money(qty * product.price)}</span>
            </div>
          ))}
          <div className="font-mono order-ticket-summary-row">
            <span>Subtotal</span>
            <span>{money(subtotal)}</span>
          </div>
          <div className="font-mono order-ticket-summary-row">
            <span>Envío ({deliveryType === 'delivery' ? 'delivery' : 'recojo en tienda'})</span>
            <span>{shipping === 0 ? 'Gratis' : money(shipping)}</span>
          </div>
          <div className="font-mono order-ticket-total">
            <span>TOTAL</span>
            <span>{money(total)}</span>
          </div>
          <div className="order-ticket-tax-breakdown">
            <p className="order-ticket-tax-note">El total incluye IGV. Desglose:</p>
            <div className="font-mono order-ticket-summary-row">
              <span>Importe sin IGV</span>
              <span>{money(baseCentimos / 100)}</span>
            </div>
            <div className="font-mono order-ticket-summary-row">
              <span>IGV (18%) incluido</span>
              <span>{money(igv)}</span>
            </div>
          </div>
        </div>
      </div>
      <div className="order-details">
        <div>
          <strong>Entrega:</strong> {form.name} · {form.phone}
        </div>
        <div>{deliveryType === 'delivery' ? `${form.address}${form.reference ? ` (${form.reference})` : ''}` : 'Recojo en tienda'}</div>
        <div>
          <strong>Pago:</strong>{' '}
          {payment === 'efectivo' && (deliveryType === 'delivery' ? 'Efectivo (Contra entrega)' : 'Efectivo (Pagar en caja)')}
          {payment === 'yape' && (deliveryType === 'delivery' ? 'Yape / Plin (Contra entrega)' : 'Yape / Plin (Pagar en caja)')}
          {payment === 'tarjeta' &&
            (cardReceipt
              ? `${cardReceipt.brandLabel} terminada en ${cardReceipt.last4} · Aprobado (${cardReceipt.authCode})`
              : 'Tarjeta')}
        </div>
      </div>

      {unpaidOrder && (
        <div className="payment-unpaid-warning-banner" role="alert" style={{ margin: '16px 0' }}>
          <AlertTriangle size={18} className="payment-unpaid-warning-icon" />
          <div>
            <strong>Tienes un pedido pendiente de pago ({formatCodigoPedido(unpaidOrder.id)}):</strong>
            <p>
              No puedes solicitar otro pedido en {payment === 'efectivo' ? 'efectivo' : 'Yape / Plin'} hasta que se confirme el pago del anterior en {unpaidOrder.tipo === 'delivery' ? 'entrega' : 'caja'}. Regresa al paso anterior y selecciona <strong>Tarjeta</strong> para continuar.
            </p>
          </div>
        </div>
      )}

      <div className="checkout-actions">
        <button className="btn-outline checkout-actions-back" onClick={onBack}>
          Atrás
        </button>
        <button className="btn-ember checkout-actions-primary" disabled={saving || blocked || Boolean(unpaidOrder)} onClick={onConfirm}>
          {saving ? 'Guardando...' : 'Confirmar pedido'}
        </button>
      </div>
    </div>
  )
}
