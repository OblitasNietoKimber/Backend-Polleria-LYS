import { describe, expect, test } from 'vitest'
import {
  detectCardBrand,
  formatCardNumber,
  formatCvv,
  formatExpiry,
  luhnCheck,
  validateCardForm,
} from '../src/utils/cardValidation'

describe('Utilidades de validación de tarjetas', () => {
  test('luhnCheck valida correctamente números de tarjeta', () => {
    // Tarjeta de prueba estándar de Visa válida
    expect(luhnCheck('4242424242424242')).toBe(true)
    // Tarjeta con checksum inválido
    expect(luhnCheck('4242424242424241')).toBe(false)
    expect(luhnCheck('')).toBe(false)
    expect(luhnCheck(null)).toBe(false)
  })

  test('detectCardBrand reconoce marcas admitidas', () => {
    expect(detectCardBrand('4242424242424242')).toBe('visa')
    expect(detectCardBrand('5555555555554444')).toBe('mastercard')
    expect(detectCardBrand('378282246310005')).toBe('amex')
    expect(detectCardBrand('1234567890123456')).toBeNull()
  })

  test('formatCardNumber limita estrictamente a 16 dígitos y formatea con espacios', () => {
    // Solo dígitos, ignora letras y caracteres especiales
    expect(formatCardNumber('4242abc4242')).toBe('4242 4242')
    // Máximo 16 dígitos (19 caracteres con espacios)
    expect(formatCardNumber('424242424242424299999')).toBe('4242 4242 4242 4242')
    expect(formatCardNumber('4242424242424242').replace(/\s/g, '').length).toBe(16)
  })

  test('formatCvv limita estrictamente a 3 dígitos numéricos', () => {
    expect(formatCvv('12')).toBe('12')
    expect(formatCvv('123')).toBe('123')
    expect(formatCvv('12345')).toBe('123') // Corta en 3
    expect(formatCvv('12a3#')).toBe('123') // Ignora letras y símbolos
  })

  test('formatExpiry formatea MM/AA y limita a 4 dígitos', () => {
    expect(formatExpiry('1')).toBe('1')
    expect(formatExpiry('12')).toBe('12')
    expect(formatExpiry('12/')).toBe('12/')
    expect(formatExpiry('122')).toBe('12/2')
    expect(formatExpiry('1228')).toBe('12/28')
    expect(formatExpiry('1228999')).toBe('12/28') // Corta en 4 dígitos
  })

  test('validateCardForm rechaza campos incompletos o vacíos', () => {
    const errors = validateCardForm({ number: '', expiry: '', cvv: '' })
    expect(errors.number).toBe('Ingresa el número de tarjeta.')
    expect(errors.expiry).toBe('Ingresa la fecha de vencimiento.')
    expect(errors.cvv).toBe('Ingresa el código de seguridad (CVV).')
  })

  test('validateCardForm exige 16 dígitos en número de tarjeta', () => {
    const errors = validateCardForm({
      number: '4242 4242 4242', // solo 12 dígitos
      expiry: '12/28',
      cvv: '123',
    })
    expect(errors.number).toBe('El número de tarjeta debe tener 16 dígitos.')
  })

  test('validateCardForm exige exactamente 3 dígitos en el CVV', () => {
    const errorsTwo = validateCardForm({
      number: '4242 4242 4242 4242',
      expiry: '12/28',
      cvv: '12',
    })
    expect(errorsTwo.cvv).toBe('El código de seguridad debe tener 3 dígitos.')
  })

  test('validateCardForm detecta tarjetas vencidas y meses inválidos', () => {
    const invalidMonth = validateCardForm({
      number: '4242 4242 4242 4242',
      expiry: '13/28',
      cvv: '123',
    })
    expect(invalidMonth.expiry).toBe('El mes debe estar entre 01 y 12.')

    const expired = validateCardForm({
      number: '4242 4242 4242 4242',
      expiry: '01/20',
      cvv: '123',
    })
    expect(expired.expiry).toBe('La tarjeta está vencida.')
  })

  test('validateCardForm aprueba tarjeta válida de 16 dígitos, fecha futura y CVV de 3 dígitos', () => {
    const valid = validateCardForm({
      number: '4242 4242 4242 4242',
      expiry: '12/30',
      cvv: '123',
    })
    expect(Object.keys(valid)).toHaveLength(0)
  })
})
