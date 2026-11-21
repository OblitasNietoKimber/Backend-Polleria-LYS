/**
 * Validaciones del formulario de entrega y checkout de Pollería LYS
 */
import { asForm, getPersonNameError, normalizePersonName } from './identityValidation'
import { isWithinCarabayllo } from './carabaylloLocation'

export const DELIVERY_LIMITS = Object.freeze({ name: 120, address: 150, reference: 150, phone: 9 })

// Los límites pertenecen al estado, no a los atributos editables del DOM.
export function updateDeliveryField(form, field, value) {
  if (field === 'deliveryLocation') {
    if (!isWithinCarabayllo(value?.point) || typeof value?.address !== 'string' || value.address.length > DELIVERY_LIMITS.address) return { ...form, location: null }
    return { ...form, address: value.address, location: { lat: value.point.lat, lng: value.point.lng, address: value.address } }
  }
  if (field === 'location') return { ...form, location: value }
  if (!Object.hasOwn(DELIVERY_LIMITS, field) || typeof value !== 'string') return form
  const nextValue = value.slice(0, DELIVERY_LIMITS[field])
  return { ...form, [field]: nextValue, ...(field === 'address' && nextValue !== form.address ? { location: null } : {}) }
}

export function normalizeDeliveryType(type) {
  return type === 'pickup' ? 'recojo' : type
}

export function normalizeDeliveryForm(form, deliveryType) {
  const result = {
    name: normalizePersonName(form.name), phone: form.phone.trim(),
    address: normalizeDeliveryType(deliveryType) === 'delivery' ? form.address.trim() : '',
    reference: typeof form.reference === 'string' ? form.reference.trim() : '',
  }
  if (normalizeDeliveryType(deliveryType) === 'delivery' && form.location != null) {
    result.location = { lat: form.location.lat, lng: form.location.lng }
  }
  return result
}

export function validateDeliveryForm(form = {}, deliveryType = 'delivery') {
  form = asForm(form)
  const nextErrors = {}
  const nameError = getPersonNameError(form.name ?? '', { minLength: 7, requiredMessage:
    normalizePersonName(form.name) ? 'Escribe tu nombre completo (debe tener más de 6 letras).' : 'Ingresa tu nombre completo.' })
  if (nameError) nextErrors.name = nameError
  if (typeof form.name === 'string' && form.name.length > DELIVERY_LIMITS.name) nextErrors.name = 'El nombre debe tener hasta 120 caracteres.'

  const trimmedPhone = typeof form.phone === 'string' ? form.phone.trim() : ''
  if (!trimmedPhone) {
    nextErrors.phone = 'Ingresa un teléfono de contacto.'
  } else if (form.phone.length > DELIVERY_LIMITS.phone || !/^9\d{8}$/.test(trimmedPhone)) {
    nextErrors.phone = 'El teléfono debe tener 9 dígitos y empezar con 9.'
  }

  if (!['delivery', 'recojo'].includes(normalizeDeliveryType(deliveryType))) nextErrors.deliveryType = 'Selecciona delivery o recojo en tienda.'
  if (form.reference !== undefined && (typeof form.reference !== 'string' || form.reference.length > DELIVERY_LIMITS.reference || /[\p{Cc}\p{Cf}]/u.test(form.reference))) {
    nextErrors.reference = `La referencia debe ser texto de hasta ${DELIVERY_LIMITS.reference} caracteres.`
  }
  if (deliveryType === 'delivery') {
    const trimmedAddress = typeof form.address === 'string' ? form.address.trim() : ''
    if (!trimmedAddress) {
      nextErrors.address = 'Ingresa tu dirección de entrega en Carabayllo.'
    } else if (trimmedAddress.length < 5) {
      nextErrors.address = 'La dirección debe tener al menos 5 caracteres.'
    } else if (form.address.length > DELIVERY_LIMITS.address || /[\p{Cc}\p{Cf}]/u.test(form.address)) {
      nextErrors.address = `La dirección debe tener hasta ${DELIVERY_LIMITS.address} caracteres y no incluir caracteres de control.`
    }

    if (form.location == null) {
      nextErrors.location = 'Selecciona tu dirección en las sugerencias o en el mapa de Carabayllo.'
    } else if (typeof form.location !== 'object' || Array.isArray(form.location) ||
        typeof form.location.lat !== 'number' || typeof form.location.lng !== 'number' ||
        !isWithinCarabayllo(form.location) || form.location.outOfZone) {
      nextErrors.location = 'La ubicación seleccionada está fuera de Carabayllo. Selecciona un punto dentro de la zona delimitada.'
    } else if (form.location.address !== form.address) {
      nextErrors.location = 'Vuelve a seleccionar la ubicación para confirmar la dirección modificada.'
    }
  }

  return nextErrors
}
