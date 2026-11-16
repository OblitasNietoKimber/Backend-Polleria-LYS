import { useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import CheckoutSteps from '../../components/CheckoutSteps'
import PaymentMethod from '../../components/PaymentMethod'
import { useCart } from '../../context/CartContext'
import { validateCardForm } from '../../utils/cardValidation'
import { chargeCard } from '../../services/paymentGatewayService'
import '../../styles/compras.css'

export default function PagoPage() {
  const navigate = useNavigate()
  const { deliveryType, payment, setPayment, card, updateCardField, total, setCardReceipt, form } = useCart()
  const [cardErrors, setCardErrors] = useState({})
  const [processing, setProcessing] = useState(false)
  const [gatewayError, setGatewayError] = useState('')

  function handlePaymentChange(method) {
    setPayment(method)
    setCardErrors({})
    setGatewayError('')
  }

  function handleCardChange(field, value) {
    updateCardField(field, value)
    if (cardErrors[field]) {
      setCardErrors((current) => {
        const next = { ...current }
        delete next[field]
        return next
      })
    }
    if (gatewayError) setGatewayError('')
  }

  async function handleContinue() {
    if (payment !== 'tarjeta') {
      navigate('/checkout/resumen')
      return
    }

    const cardToValidate = {
      ...card,
      name: card.name || form?.name || 'Cliente Pollería LYS',
    }
    const errors = validateCardForm(cardToValidate)
    setCardErrors(errors)
    if (Object.keys(errors).length > 0) {
      setGatewayError('Por favor, revisa y corrige los campos marcados en rojo.')
      return
    }

    setGatewayError('')
    setProcessing(true)
    try {
      const receipt = await chargeCard({ ...cardToValidate, amount: total })
      setCardReceipt(receipt)
      navigate('/checkout/resumen')
    } catch (error) {
      if (error.fieldErrors) setCardErrors(error.fieldErrors)
      setGatewayError(error.message || 'No se pudo procesar el pago. Intenta nuevamente.')
    } finally {
      setProcessing(false)
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

      <CheckoutSteps step={2} />

      <PaymentMethod
        deliveryType={deliveryType}
        payment={payment}
        onChange={handlePaymentChange}
        card={card}
        cardErrors={cardErrors}
        processing={processing}
        gatewayError={gatewayError}
        onCardChange={handleCardChange}
        onBack={() => navigate('/checkout/entrega')}
        onContinue={handleContinue}
        total={total}
      />
    </section>
  )
}
