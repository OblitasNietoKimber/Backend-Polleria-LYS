import { expect, test } from 'vitest'
import { getPersonNameError, normalizePersonName } from '../src/utils/identityValidation'
import { validateRegisterForm, validatePersonalDataForm } from '../src/services/validators'
import { validateDeliveryForm } from '../src/utils/deliveryValidation'

const valid = { nombre: 'María José', apellido: "O'Neill-Pérez", telefono: '987654321', email: 'persona@example.test', password: 'Clave12345', confirmPassword: 'Clave12345' }

test.each(['123456', 'Juan2', '١٢٣', '<script>', 'Ana_Ortiz', '--', 'Ana\nPérez', 'Ana\u200bPérez', 123, {}, [], null])('rechaza el nombre manipulado %j en registro y perfil', nombre => {
  expect(validateRegisterForm({ ...valid, nombre }).nombre).toBeTruthy()
  expect(validatePersonalDataForm({ ...valid, nombre }).nombre).toBeTruthy()
})

test.each(['María José', 'Peña', "O'Neill", 'D’Angelo', 'Jean-Luc', 'Jose\u0301'])('admite el nombre %s', nombre => {
  expect(getPersonNameError(nombre)).toBeNull()
})

test('normaliza tildes y espacios sin convertir números en nombres válidos', () => {
  expect(normalizePersonName('  Jose\u0301   Pérez  ')).toBe('José Pérez')
  expect(validateRegisterForm(valid)).toEqual({})
  expect(validateRegisterForm({ ...valid, nombre: 'a'.repeat(121) }).nombre).toBeTruthy()
  expect(validateRegisterForm({ ...valid, nombre: 'a'.repeat(70), apellido: 'b'.repeat(70) }).nombre).toBeTruthy()
})

test.each([null, [], 123, { ...valid, email: 123 }, { ...valid, telefono: 987654321 }, { ...valid, password: {} }])('los tipos manipulados devuelven errores y no rompen el validador: %j', form => {
  expect(() => validateRegisterForm(form)).not.toThrow()
  expect(Object.keys(validateRegisterForm(form)).length).toBeGreaterThan(0)
})

test('no confía en la bandera de zona ni en tipos falsificados de entrega', () => {
  const form = { name: 'María Pérez', phone: '987654321', address: 'Av. Prueba 123' }
  expect(validateDeliveryForm({ ...form, location: { lat: 0, lng: 0, outOfZone: false } }).location).toBeTruthy()
  expect(validateDeliveryForm({ ...form, location: { lat: -11.88, lng: -77.03, address: form.address } }).location).toBeUndefined()
  expect(validateDeliveryForm({ ...form, location: { lat: '-11.88', lng: '-77.03' } }).location).toBeTruthy()
  expect(validateDeliveryForm({ ...form, address: {} }).address).toBeTruthy()
  expect(validateDeliveryForm({ ...form, reference: 'a'.repeat(501) }).reference).toBeTruthy()
  expect(validateDeliveryForm(form, 'inventado').deliveryType).toBeTruthy()
})
