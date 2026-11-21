import { describe, expect, test } from 'vitest'
import { validateDeliveryForm } from '../src/utils/deliveryValidation'

describe('Validaciones del formulario de entrega y checkout', () => {
  test('la dirección admite 150 caracteres y rechaza 151 antes de enviar', () => {
    for (const length of [150, 151]) {
      const address = 'a'.repeat(length)
      const errors = validateDeliveryForm({ name: 'Cliente Prueba', phone: '987654321', address,
        location: { lat: -11.88, lng: -77.03, address } })
      if (length === 150) expect(errors).toEqual({})
      else expect(errors.address).toContain('150 caracteres')
    }
  })
  test('la referencia es opcional y admite hasta 150 caracteres', () => {
    const form = { name: 'Cliente Prueba', phone: '987654321' }
    for (const reference of [undefined, '', 'r'.repeat(150)]) {
      expect(validateDeliveryForm({ ...form, reference }, 'recojo')).toEqual({})
    }
    expect(validateDeliveryForm({ ...form, reference: 'r'.repeat(151) }, 'recojo').reference)
      .toBe('La referencia debe ser texto de hasta 150 caracteres.')
  })
  test('rechaza nombres vacíos o menores o iguales a 6 letras pidiendo nombre completo', () => {
    // Vacío
    const resEmpty = validateDeliveryForm({ name: '', phone: '987654321', address: 'Av. Túpac Amaru 1234' })
    expect(resEmpty.name).toBe('Ingresa tu nombre completo.')

    // Solo espacios
    const resSpaces = validateDeliveryForm({ name: '     ', phone: '987654321', address: 'Av. Túpac Amaru 1234' })
    expect(resSpaces.name).toBe('Ingresa tu nombre completo.')

    // 3 letras: 'Ana'
    const resShort3 = validateDeliveryForm({ name: 'Ana', phone: '987654321', address: 'Av. Túpac Amaru 1234' })
    expect(resShort3.name).toBe('Escribe tu nombre completo (debe tener más de 6 letras).')

    // 6 letras exactas: 'Carlos' (no es mayor de 6)
    const res6 = validateDeliveryForm({ name: 'Carlos', phone: '987654321', address: 'Av. Túpac Amaru 1234' })
    expect(res6.name).toBe('Escribe tu nombre completo (debe tener más de 6 letras).')

    // 7 letras: 'Rodrigo' (> 6 letras)
    const res7 = validateDeliveryForm({ name: 'Rodrigo', phone: '987654321', address: 'Av. Túpac Amaru 1234' })
    expect(res7.name).toBeUndefined()

    // Nombre completo típico
    const resFull = validateDeliveryForm({ name: 'María Torres López', phone: '987654321', address: 'Av. Túpac Amaru 1234' })
    expect(resFull.name).toBeUndefined()
  })

  test('valida teléfono peruano de 9 dígitos que comience con 9', () => {
    expect(validateDeliveryForm({ name: 'Carlos López', phone: '' }).phone).toBe('Ingresa un teléfono de contacto.')
    expect(validateDeliveryForm({ name: 'Carlos López', phone: '123456789' }).phone).toBe('El teléfono debe tener 9 dígitos y empezar con 9.')
    expect(validateDeliveryForm({ name: 'Carlos López', phone: '98765432' }).phone).toBe('El teléfono debe tener 9 dígitos y empezar con 9.')
    expect(validateDeliveryForm({ name: 'Carlos López', phone: '987654321' }).phone).toBeUndefined()
  })

  test('valida dirección y zona de Carabayllo cuando el tipo de entrega es delivery', () => {
    // Dirección vacía
    const resNoAddress = validateDeliveryForm({ name: 'Carlos López', phone: '987654321', address: '' }, 'delivery')
    expect(resNoAddress.address).toBe('Ingresa tu dirección de entrega en Carabayllo.')

    // Ubicación fuera de zona
    const resOutOfZone = validateDeliveryForm(
      {
        name: 'Carlos López',
        phone: '987654321',
        address: 'Av. Larco 123',
        location: { outOfZone: true },
      },
      'delivery'
    )
    expect(resOutOfZone.location).toContain('fuera de Carabayllo')

    // Recojo en tienda no exige dirección
    const resPickup = validateDeliveryForm({ name: 'Carlos López', phone: '987654321' }, 'recojo')
    expect(resPickup.address).toBeUndefined()
    expect(resPickup.location).toBeUndefined()
  })
})


test('exige ubicación vinculada al texto y vuelve a invalidarla al editar la dirección', async () => {
  const { updateDeliveryField } = await import('../src/utils/deliveryValidation')
  const form = { name: 'Cliente Prueba', phone: '987654321', address: 'Av. Prueba 123', reference: '' }
  expect(validateDeliveryForm(form).location).toBeTruthy()
  const selected = updateDeliveryField(form, 'deliveryLocation', { point: { lat: -11.88, lng: -77.03 }, address: form.address })
  expect(validateDeliveryForm(selected)).toEqual({})
  const edited = updateDeliveryField(selected, 'address', 'Otra calle 123')
  expect(edited.location).toBeNull()
  expect(validateDeliveryForm(edited).location).toBeTruthy()
  expect(validateDeliveryForm({ ...selected, address: 'Otra calle 123' }).location).toBeTruthy()
})

test('limita los valores en el estado y rechaza datos sobredimensionados recibidos directamente', async () => {
  const { DELIVERY_LIMITS, updateDeliveryField } = await import('../src/utils/deliveryValidation')
  for (const [field, limit] of Object.entries(DELIVERY_LIMITS)) {
    expect(updateDeliveryField({}, field, 'a'.repeat(limit + 50))[field]).toHaveLength(limit)
    expect(validateDeliveryForm({ name: 'Cliente Prueba', phone: '987654321', [field]: 'a'.repeat(limit + 1) })[field]).toBeTruthy()
  }
  expect(updateDeliveryField({}, 'rol', 'admin')).toEqual({})
})
