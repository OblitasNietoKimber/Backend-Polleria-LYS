import { useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import CheckoutSteps from '../../components/CheckoutSteps'
import DeliveryForm from '../../components/DeliveryForm'
import { useCart } from '../../context/CartContext'
import { validateDeliveryForm } from '../../utils/deliveryValidation'
import '../../styles/compras.css'

export { validateDeliveryForm }

export default function EntregaPage() {
  const navigate = useNavigate()
  const { deliveryType, setDeliveryType, form, updateFormField } = useCart()
  const [errors, setErrors] = useState({})

  function validate() {
    const nextErrors = validateDeliveryForm(form, deliveryType)
    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  return (
    <section className="checkout-page">
      <button
        onClick={() => navigate('/catalogo')}
        className="lys-navlink checkout-back-link"
      >
        <ArrowLeft size={15} /> Seguir comprando
      </button>

      <CheckoutSteps step={1} />

      <DeliveryForm
        deliveryType={deliveryType}
        form={form}
        errors={errors}
        onTypeChange={setDeliveryType}
        onFormChange={updateFormField}
        onContinue={() => {
          if (validate()) navigate('/checkout/pago')
        }}
      />
    </section>
  )
}
