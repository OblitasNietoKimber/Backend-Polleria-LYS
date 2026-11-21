import { useEffect, useRef, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import CheckoutSteps from '../../components/CheckoutSteps'
import OrderSummary from '../../components/OrderSummary'
import { useCart } from '../../context/CartContext'
import { money } from '../../utils/currency'
import orderService from '../../services/orderService'
import { validateCheckout } from '../../utils/checkoutValidation'
import '../../styles/compras.css'

export default function ResumenPage() {
  const navigate = useNavigate()
  const { cartItems, subtotal, shipping, total, deliveryType, form, payment, cardReceipt, confirmOrder, cartLoading, cartError, orderNumber, isResumingOrder } = useCart()
  const unavailable = cartItems.some(item => !item.product.available)
  const isSubmitting = useRef(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [unpaidOrder, setUnpaidOrder] = useState(null)
  const validationError = Object.values(validateCheckout({ items: cartItems, deliveryType, form, payment }, { checkStock: true }))[0] || ''

  useEffect(() => {
    if (payment !== 'tarjeta') {
      orderService.getActiveUnpaidOrder()
        .then((unpaid) => setUnpaidOrder(unpaid && isResumingOrder(unpaid.id) ? null : unpaid))
        .catch(() => setUnpaidOrder(null))
    }
  }, [payment, isResumingOrder])

  // Si eligió tarjeta pero no completó el cobro (por ejemplo, llegó por atrás
  // o refrescó la página), lo regresamos a Pago en vez de dejarlo confirmar
  // un pedido sin pago autorizado.
  useEffect(() => {
    if (isSubmitting.current || orderNumber || saving) return
    if (payment === 'tarjeta' && !cardReceipt) {
      navigate('/checkout/pago', { replace: true })
    }
  }, [payment, cardReceipt, navigate, orderNumber, saving])

  async function handleConfirm() {
    if (saving) return
    setSaving(true)
    setError('')
    isSubmitting.current = true
    try {
      await confirmOrder()
      navigate('/confirmacion')
    } catch (err) {
      isSubmitting.current = false
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="checkout-page">
      <button
        onClick={() => navigate('/catalogo')}
        className="lys-navlink checkout-back-link"
      >
        <ArrowLeft size={15} /> Seguir comprando
      </button>

      <CheckoutSteps step={3} />

      {error && <p role="alert">{error}</p>}
      {!error && !cartLoading && !unpaidOrder && validationError && <p role="alert">{validationError}</p>}
      {saving && <p role="status">Guardando pedido...</p>}
      {cartLoading && <p role="status">Actualizando los productos del carrito...</p>}
      {(cartError || unavailable) && <p role="alert">{cartError || 'Hay productos no disponibles en el carrito.'}</p>}
      <OrderSummary
        items={cartItems}
        subtotal={subtotal}
        shipping={shipping}
        total={total}
        deliveryType={deliveryType}
        form={form}
        payment={payment}
        cardReceipt={cardReceipt}
        money={money}
        onBack={() => navigate('/checkout/pago')}
        onConfirm={handleConfirm}
        saving={saving}
        blocked={cartLoading || Boolean(cartError) || unavailable || Boolean(unpaidOrder) || Boolean(validationError)}
        unpaidOrder={unpaidOrder}
      />
    </section>
  )
}
