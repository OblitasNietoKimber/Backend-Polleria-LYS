import { CreditCard, Smartphone, Wallet, CheckCircle2 } from 'lucide-react'
import CardPaymentForm from './CardPaymentForm'

export default function PaymentMethod({
  deliveryType = 'delivery',
  payment,
  onChange,
  card,
  cardErrors,
  processing,
  gatewayError,
  onCardChange,
  onBack,
  onContinue,
  total = 0,
}) {
  const isDelivery = deliveryType === 'delivery'

  const methods = [
    {
      id: 'efectivo',
      label: 'Efectivo',
      badge: isDelivery ? 'Contra entrega' : null,
      desc: isDelivery ? 'Pagas en efectivo al recibir tu pedido en tu puerta.' : 'Pagas en efectivo al recoger tu pedido en tienda.',
      icon: Wallet,
    },
    {
      id: 'yape',
      label: 'Yape / Plin',
      badge: isDelivery ? 'Contra entrega' : null,
      desc: isDelivery ? 'Pagas con código QR al repartidor cuando llegue tu pedido.' : 'Pago digital mediante QR en caja.',
      icon: Smartphone,
    },
    {
      id: 'tarjeta',
      label: 'Tarjeta',
      badge: null,
      desc: 'Débito o crédito procesado de forma segura.',
      icon: CreditCard,
    },
  ]

  return (
    <div>
      <h2 className="font-display checkout-form-title">Método de pago</h2>
      <div className="payment-methods-grid">
        {methods.map((method) => (
          <button
            key={method.id}
            onClick={() => onChange(method.id)}
            disabled={processing}
            className={`payment-method-option ${payment === method.id ? 'active' : ''}`}
          >
            <method.icon size={22} color={payment === method.id ? 'var(--ember)' : 'var(--smoke)'} strokeWidth={1.7} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="payment-method-info-title">
                <span>{method.label}</span>
                {method.badge && <span className="payment-contraentrega-tag">{method.badge}</span>}
              </div>
              <div className="payment-method-info-desc">{method.desc}</div>
            </div>
          </button>
        ))}
      </div>

      {isDelivery && (payment === 'efectivo' || payment === 'yape') && (
        <div className="payment-contraentrega-banner">
          <CheckCircle2 size={17} className="payment-contraentrega-banner-icon" />
          <span>
            <strong>Modalidad Contra Entrega:</strong>{' '}
            {payment === 'efectivo'
              ? 'Ten listo el monto exacto o sencillo en efectivo al momento de recibir tu entrega.'
              : 'El repartidor te mostrará el código QR (Yape o Plin) para escanear y pagar al recibir tu entrega.'}
          </span>
        </div>
      )}

      {payment === 'tarjeta' && (
        <CardPaymentForm
          card={card}
          errors={cardErrors}
          processing={processing}
          gatewayError={gatewayError}
          onChange={onCardChange}
          total={total}
          onPay={onContinue}
        />
      )}

      {payment !== 'tarjeta' ? (
        <div className="checkout-actions">
          <button className="btn-outline checkout-actions-back" onClick={onBack} disabled={processing}>
            Atrás
          </button>
          <button className="btn-ember checkout-actions-primary" disabled={!payment || processing} onClick={onContinue}>
            {processing ? 'Procesando…' : 'Ver resumen'}
          </button>
        </div>
      ) : (
        <div className="checkout-actions stripe-actions-centered" style={{ maxWidth: '520px', margin: '14px auto 0 auto', justifyContent: 'center' }}>
          <button className="btn-outline checkout-actions-back" onClick={onBack} disabled={processing}>
            Atrás
          </button>
        </div>
      )}
    </div>
  )
}
