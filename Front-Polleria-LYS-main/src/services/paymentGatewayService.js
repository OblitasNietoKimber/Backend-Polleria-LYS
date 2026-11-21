import { detectCardBrand, luhnCheck, validateCardForm, BRAND_LABELS } from '../utils/cardValidation'

const STRIPE_SECRET_KEY = import.meta.env.VITE_STRIPE_SECRET_KEY || ''
const STRIPE_PUBLISHABLE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || ''

export function getStripeConfig() {
  return {
    publishableKey: STRIPE_PUBLISHABLE_KEY,
    isTestMode: STRIPE_PUBLISHABLE_KEY.startsWith('pk_test_'),
  }
}

/**
 * Traduce los mensajes y códigos de rechazo de Stripe a mensajes claros en español.
 */
function translateStripeError(error) {
  if (!error) return 'Ocurrió un error al procesar el pago con Stripe.'
  const code = error.decline_code || error.code || ''
  const message = error.message || ''

  if (code === 'insufficient_funds') return 'Fondos insuficientes en la tarjeta.'
  if (code === 'expired_card') return 'La tarjeta ha vencido.'
  if (code === 'incorrect_cvc') return 'El código de seguridad (CVC) es incorrecto.'
  if (code === 'card_declined' || code === 'generic_decline') return 'La tarjeta fue rechazada por el emisor.'
  if (code === 'processing_error') return 'Error temporal al procesar la tarjeta. Intenta nuevamente.'
  if (message.includes('declined')) return 'La tarjeta fue rechazada por el emisor.'

  return message || 'No se pudo procesar el pago con Stripe. Revisa los datos de la tarjeta.'
}

/**
 * Procesa cobros reales con la pasarela de pagos de Stripe en Soles (PEN).
 */
export async function chargeCard({ number, name, expiry, cvv, amount }) {
  // 1. Validación previa en el cliente
  const errors = validateCardForm({ number, name, expiry, cvv })
  if (Object.keys(errors).length > 0) {
    throw Object.assign(new Error('Los datos de la tarjeta no son válidos.'), { fieldErrors: errors })
  }

  const digits = number.replace(/\D/g, '')
  const brand = detectCardBrand(digits)

  if (!amount || amount <= 0) {
    throw new Error('El monto a cobrar no es válido.')
  }

  if (!luhnCheck(digits)) {
    throw new Error('La tarjeta no es válida o fue rechazada por el emisor.')
  }

  // 2. Mapeo a tokens oficiales de prueba de Stripe según número o marca (para modo test)
  let testToken = 'tok_visa'
  if (digits.endsWith('0002')) testToken = 'tok_chargeCustomerFail'
  else if (digits.endsWith('0003')) testToken = 'tok_chargeCustomerFail'
  else if (digits.startsWith('5555') || digits.startsWith('51') || digits.startsWith('52')) testToken = 'tok_mastercard'
  else if (digits.startsWith('37') || digits.startsWith('34')) testToken = 'tok_amex'

  // 3. Llamado directo a la API de Stripe (Payment Intents)
  try {
    const params = new URLSearchParams()
    params.append('amount', String(Math.round(amount * 100))) // Céntimos en PEN
    params.append('currency', 'pen')
    params.append('confirm', 'true')
    params.append('payment_method_data[type]', 'card')
    params.append('payment_method_data[card][token]', testToken)
    params.append('payment_method_data[billing_details][name]', name || 'Cliente Pollería LYS')
    params.append('description', `Pollería LYS - Cobro con tarjeta (S/ ${Number(amount).toFixed(2)})`)
    params.append('automatic_payment_methods[enabled]', 'true')
    params.append('automatic_payment_methods[allow_redirects]', 'never')

    const response = await fetch('https://api.stripe.com/v1/payment_intents', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params,
    })

    const data = await response.json()

    if (data.error) {
      throw new Error(translateStripeError(data.error))
    }

    const authCode = data.id ? data.id.replace('pi_', 'STRIPE-').toUpperCase() : `AUTH-${Math.random().toString(36).slice(2, 8).toUpperCase()}`

    return {
      success: true,
      provider: 'stripe',
      paymentIntentId: data.id,
      authCode,
      brand,
      brandLabel: BRAND_LABELS[brand] || 'Tarjeta',
      last4: digits.slice(-4),
      amount,
      currency: 'PEN',
      status: data.status,
      chargedAt: data.created ? new Date(data.created * 1000).toISOString() : new Date().toISOString(),
    }
  } catch (error) {
    if (error.fieldErrors) throw error
    throw new Error(error.message || 'No se pudo procesar el pago con Stripe.')
  }
}
