import { AlertCircle, CreditCard, Lock } from 'lucide-react'
import { detectCardBrand, formatCardNumber, formatCvv, formatExpiry } from '../utils/cardValidation'
import FixedLengthInput from './common/FixedLengthInput'

export default function CardPaymentForm({
  card,
  errors = {},
  processing = false,
  gatewayError = '',
  onChange,
  total = 0,
  onPay,
}) {
  const digits = (card?.number || '').replace(/\D/g, '')
  const brand = detectCardBrand(digits)

  function handleNumberChange(event) {
    onChange('number', formatCardNumber(event.target.value))
  }

  function handleExpiryChange(event) {
    onChange('expiry', formatExpiry(event.target.value))
  }

  function handleCvvChange(event) {
    onChange('cvv', formatCvv(event.target.value))
  }

  /**
   * Bloquea la entrada de letras y caracteres especiales directamente en el teclado.
   */
  function handleNumericKeyDown(event, allowSlash = false) {
    const navigationKeys = [
      'Backspace', 'Tab', 'Delete', 'ArrowLeft', 'ArrowRight',
      'ArrowUp', 'ArrowDown', 'Home', 'End', 'Enter'
    ]
    if (navigationKeys.includes(event.key) || event.ctrlKey || event.metaKey) {
      return
    }
    if (allowSlash && (event.key === '/' || event.key === '-')) {
      return
    }
    if (!/^[0-9]$/.test(event.key)) {
      event.preventDefault()
    }
  }

  const formattedAmount = `S/ ${Number(total || 0).toFixed(2)}`

  return (
    <div className="stripe-checkout-card" aria-busy={processing}>
      {/* Cabecera con Método de pago y Bandera de Perú */}
      <div className="stripe-checkout-head">
        <span className="stripe-checkout-title">Método de pago</span>
        <span className="stripe-peru-flag-badge" title="Perú (PEN)">
          <svg width="26" height="18" viewBox="0 0 24 17" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="24" height="17" rx="3" fill="#FFFFFF" />
            <rect width="8" height="17" fill="#D91023" />
            <rect x="16" width="8" height="17" fill="#D91023" />
            <rect width="24" height="17" rx="3" stroke="#CBD5E1" strokeWidth="1" />
          </svg>
        </span>
      </div>

      {/* Contenedor exclusivo de Tarjeta (sin transferencia bancaria) */}
      <div className="stripe-card-box">
        <div className="stripe-card-box-header">
          <CreditCard size={18} className="stripe-card-icon" />
          <span>Tarjeta</span>
        </div>

        <div className="stripe-card-fields">
          {/* Número de tarjeta (máximo 16 dígitos) */}
          <div className="stripe-field-group">
            <div className="stripe-input-wrapper">
              <FixedLengthInput
                className={`stripe-input stripe-input-card-number ${errors.number ? 'err' : ''}`}
                value={card?.number || ''}
                onChange={handleNumberChange}
                onKeyDown={(e) => handleNumericKeyDown(e)}
                inputMode="numeric"
                pattern="[0-9 ]*"
                maxLength={19}
                placeholder="Número de tarjeta"
                disabled={processing}
                autoComplete="cc-number"
                aria-invalid={Boolean(errors.number)}
              />
              <div className="stripe-card-brands" aria-hidden="true">
                <span className={`stripe-brand-logo logo-generic ${!brand ? 'active' : ''}`}>
                  <span className="dot dot-green" />
                  <span className="dot dot-blue" />
                  <span className="dot dot-red" />
                </span>
                <span className={`stripe-brand-logo logo-visa ${brand === 'visa' ? 'active' : ''}`}>
                  VISA
                </span>
                <span className={`stripe-brand-logo logo-amex ${brand === 'amex' ? 'active' : ''}`}>
                  AMEX
                </span>
                <span className={`stripe-brand-logo logo-mc ${brand === 'mastercard' ? 'active' : ''}`}>
                  <span className="mc-circle red" />
                  <span className="mc-circle yellow" />
                </span>
              </div>
            </div>
            {errors.number && (
              <span className="checkout-field-error" role="alert">
                <AlertCircle size={13} />
                <span>{errors.number}</span>
              </span>
            )}
          </div>

          {/* Fila Fecha de caducidad y Código de seguridad */}
          <div className="stripe-card-row">
            <div className="stripe-field-group">
              <FixedLengthInput
                className={`stripe-input ${errors.expiry ? 'err' : ''}`}
                value={card?.expiry || ''}
                onChange={handleExpiryChange}
                onKeyDown={(e) => handleNumericKeyDown(e, true)}
                inputMode="numeric"
                maxLength={5}
                placeholder="Fecha de caducidad"
                disabled={processing}
                autoComplete="cc-exp"
                aria-invalid={Boolean(errors.expiry)}
              />
              {errors.expiry && (
                <span className="checkout-field-error" role="alert">
                  <AlertCircle size={13} />
                  <span>{errors.expiry}</span>
                </span>
              )}
            </div>

            <div className="stripe-field-group">
              <div className="stripe-input-wrapper">
                <FixedLengthInput
                  className={`stripe-input ${errors.cvv ? 'err' : ''}`}
                  value={card?.cvv || ''}
                  onChange={handleCvvChange}
                  onKeyDown={(e) => handleNumericKeyDown(e)}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={3}
                  placeholder="Código de seguridad"
                  disabled={processing}
                  autoComplete="cc-csc"
                  aria-invalid={Boolean(errors.cvv)}
                />
                <span className="stripe-cvc-icon" aria-hidden="true" title="CVC">
                  <svg width="22" height="15" viewBox="0 0 22 15" fill="none">
                    <rect width="22" height="15" rx="2" fill="#E2E8F0" />
                    <rect y="3" width="22" height="3" fill="#94A3B8" />
                    <rect x="13" y="8" width="6" height="4" rx="1" fill="#FFFFFF" />
                  </svg>
                </span>
              </div>
              {errors.cvv && (
                <span className="checkout-field-error" role="alert">
                  <AlertCircle size={13} />
                  <span>{errors.cvv}</span>
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {(gatewayError || errors.general || errors.name) && (
        <div className="card-gateway-error" role="alert">
          <AlertCircle size={16} className="card-error-icon" />
          <span>{gatewayError || errors.general || errors.name}</span>
        </div>
      )}

      {/* Botón Pagar en Soles */}
      <button
        type="button"
        className="stripe-pay-button"
        disabled={processing}
        onClick={onPay}
      >
        {processing ? (
          <>
            <span className="card-spinner" /> Procesando pago {formattedAmount}…
          </>
        ) : (
          `Pagar ${formattedAmount}`
        )}
      </button>

      <div className="card-stripe-badge" aria-label="Pagos procesados de forma segura">
        <Lock size={12} style={{ marginRight: 6 }} />
        <span>Pagos encriptados y procesados de forma segura</span>
      </div>
    </div>
  )
}
