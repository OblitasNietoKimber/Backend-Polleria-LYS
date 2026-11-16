import { MapPin, Store } from 'lucide-react'
import AddressAutocomplete from './AddressAutocomplete'
import DeliveryMap from './DeliveryMap'

export default function DeliveryForm({ deliveryType, form, errors = {}, onTypeChange, onFormChange, onContinue }) {
  function handlePhoneChange(event) {
    const digitsOnly = event.target.value.replace(/\D/g, '').slice(0, 9)
    if (digitsOnly && digitsOnly[0] !== '9') return
    onFormChange('phone', digitsOnly)
  }

  return (
    <div className="delivery-form-wrapper">
      <h2 className="font-display checkout-form-title">Datos de entrega</h2>
      <div className="delivery-type-group">
        <button
          type="button"
          onClick={() => onTypeChange('delivery')}
          className={`chip delivery-type-chip ${deliveryType === 'delivery' ? 'active' : ''}`}
        >
          <MapPin size={16} /> Delivery (Carabayllo)
        </button>
        <button
          type="button"
          onClick={() => onTypeChange('recojo')}
          className={`chip delivery-type-chip ${deliveryType === 'recojo' || deliveryType === 'pickup' ? 'active' : ''}`}
        >
          <Store size={16} /> Recojo en tienda
        </button>
      </div>

      <div className="delivery-form-grid">
        <label className="checkout-field-label">
          Nombre completo
          <input
            className={`lys-input ${errors.name ? 'err' : ''}`}
            value={form.name || ''}
            onChange={(event) => onFormChange('name', event.target.value)}
            placeholder="Ej. María Torres López"
            maxLength={50}
          />
          {errors.name && <span className="checkout-field-error">{errors.name}</span>}
        </label>

        {deliveryType === 'delivery' && (
          <>
            <div className="checkout-field-group">
              <label className="checkout-field-label">
                Dirección de entrega
                <AddressAutocomplete
                  value={form.address || ''}
                  onChange={(val) => onFormChange('address', val)}
                  onSelectLocation={(point, fullAddress) => {
                    onFormChange('location', point)
                    if (fullAddress) onFormChange('address', fullAddress)
                  }}
                  error={errors.address}
                  placeholder="Escribe tu calle o avenida en Carabayllo..."
                />
              </label>
              {errors.address && <span className="checkout-field-error">{errors.address}</span>}
            </div>

            <label className="checkout-field-label">
              Referencia (opcional)
              <input
                className="lys-input"
                value={form.reference || ''}
                onChange={(event) => onFormChange('reference', event.target.value)}
                placeholder="Ej. Frente al parque, fachada azul, piso 2..."
                maxLength={80}
              />
            </label>

            {/* Mapa interactivo delimitado al distrito de Carabayllo */}
            <DeliveryMap
              point={form.location || null}
              onChange={(loc) => onFormChange('location', loc)}
              onAddressDetected={(detectedAddr) => {
                if (detectedAddr) {
                  onFormChange('address', detectedAddr)
                }
              }}
            />
            {errors.location && <span className="checkout-field-error">{errors.location}</span>}
          </>
        )}

        <label className="checkout-field-label">
          Teléfono de contacto
          <input
            className={`lys-input ${errors.phone ? 'err' : ''}`}
            value={form.phone || ''}
            onChange={handlePhoneChange}
            type="tel"
            inputMode="numeric"
            maxLength={9}
            placeholder="9XXXXXXXX"
          />
          {errors.phone && <span className="checkout-field-error">{errors.phone}</span>}
        </label>
      </div>

      <button className="btn-ember checkout-submit-btn" onClick={onContinue}>
        Continuar al pago
      </button>
    </div>
  )
}
