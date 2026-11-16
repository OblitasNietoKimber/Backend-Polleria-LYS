import { CreditCard, Smartphone, Wallet, CheckCircle2, AlertTriangle } from 'lucide-react'
import CardPaymentForm from './CardPaymentForm'
import { formatCodigoPedido } from '../utils/orderNumber'

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
  activeUnpaidOrder = null,
}) {
  const isDelivery = deliveryType === 'delivery'

  const methods = [
    {
      id: 'efectivo',
      label: 'Efectivo',
      badge: isDelivery ? 'Contra entrega' : 'Pagar en caja',
      desc: isDelivery ? 'Pagas en efectivo al recibir tu pedido en tu puerta.' : 'Pagas en caja en efectivo al momento de recoger tu pedido.',
      icon: Wallet,
      disabled: Boolean(activeUnpaidOrder),
    },
    {
      id: 'yape',
      label: 'Yape / Plin',
      badge: isDelivery ? 'Contra entrega' : 'Pagar en caja',
      desc: isDelivery ? 'Pagas con código QR al repartidor cuando llegue tu pedido.' : 'Pagas con código QR en caja al momento de recoger tu pedido.',
      icon: Smartphone,
      disabled: Boolean(activeUnpaidOrder),
    },
    {
      id: 'tarjeta',
      label: 'Tarjeta',
      badge: null,
      desc: 'Débito o crédito procesado de forma segura.',
      icon: CreditCard,
      disabled: false,
    },
  ]

  return (
    <div>
      <h2 className="font-display checkout-form-title">Método de pago</h2>

      {activeUnpaidOrder && (
        <div className="payment-unpaid-warning-banner" role="alert">
          <AlertTriangle size={18} className="payment-unpaid-warning-icon" />
          <div>
            <strong>Tienes un pedido pendiente de pago ({formatCodigoPedido(activeUnpaidOrder.id)}):</strong>
            <p>
              Hasta que no se confirme que se pagó tu pedido anterior en {activeUnpaidOrder.tipo === 'delivery' ? 'entrega' : 'caja'}, solo puedes realizar pedidos nuevos pagando con <strong>Tarjeta</strong>.
            </p>
          </div>
        </div>
      )}

      <div className="payment-methods-grid">
        {methods.map((method) => {
          const isBlocked = method.disabled
          return (
            <button
              key={method.id}
              onClick={() => {
                if (!isBlocked) onChange(method.id)
              }}
              disabled={processing || isBlocked}
              className={`payment-method-option ${payment === method.id ? 'active' : ''} ${isBlocked ? 'blocked' : ''}`}
            >
              <method.icon size={22} color={payment === method.id ? 'var(--ember)' : 'var(--smoke)'} strokeWidth={1.7} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="payment-method-info-title">
                  <span>{method.label}</span>
                  {method.badge && (
                    <span className={`payment-contraentrega-tag ${!isDelivery ? 'payment-caja-tag' : ''}`}>
                      {method.badge}
                    </span>
                  )}
                  {isBlocked && <span className="payment-blocked-tag">Pago anterior pendiente</span>}
                </div>
                <div className="payment-method-info-desc">{method.desc}</div>
              </div>
            </button>
          )
        })}
      </div>

      {!activeUnpaidOrder && isDelivery && (payment === 'efectivo' || payment === 'yape') && (
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

      {!activeUnpaidOrder && !isDelivery && (payment === 'efectivo' || payment === 'yape') && (
        <div className="payment-contraentrega-banner payment-caja-banner">
          <CheckCircle2 size={17} className="payment-contraentrega-banner-icon" />
          <span>
            <strong>Modalidad Pagar en Caja:</strong>{' '}
            {payment === 'efectivo'
              ? 'Acércate a caja con tu número de pedido y paga en efectivo al momento de recoger.'
              : 'Acércate a caja con tu número de pedido y escanea el código QR de Yape o Plin al momento de recoger.'}
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
