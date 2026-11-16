/**
 * Validaciones del formulario de entrega y checkout de Pollería LYS
 */
export function validateDeliveryForm(form = {}, deliveryType = 'delivery') {
  const nextErrors = {}
  const trimmedName = form.name?.trim() || ''

  if (!trimmedName) {
    nextErrors.name = 'Ingresa tu nombre completo.'
  } else if (trimmedName.length <= 6) {
    nextErrors.name = 'Escribe tu nombre completo (debe tener más de 6 letras).'
  }

  const trimmedPhone = form.phone?.trim() || ''
  if (!trimmedPhone) {
    nextErrors.phone = 'Ingresa un teléfono de contacto.'
  } else if (!/^9\d{8}$/.test(trimmedPhone)) {
    nextErrors.phone = 'El teléfono debe tener 9 dígitos y empezar con 9.'
  }

  if (deliveryType === 'delivery') {
    const trimmedAddress = form.address?.trim() || ''
    if (!trimmedAddress) {
      nextErrors.address = 'Ingresa tu dirección de entrega en Carabayllo.'
    } else if (trimmedAddress.length < 5) {
      nextErrors.address = 'La dirección debe tener al menos 5 caracteres.'
    }

    if (form.location && form.location.outOfZone) {
      nextErrors.location = 'La ubicación seleccionada está fuera de Carabayllo. Selecciona un punto dentro de la zona delimitada.'
    }
  }

  return nextErrors
}
