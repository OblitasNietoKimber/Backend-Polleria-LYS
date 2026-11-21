export const PERSON_NAME_MAX_LENGTH = 120
export const EMAIL_MAX_LENGTH = 254
export const PASSWORD_MAX_LENGTH = 128

const NAME_PATTERN = /^\p{L}[\p{L}\p{M}]*(?:[ '\u2019-]\p{L}[\p{L}\p{M}]*)*$/u
const CONTROL_PATTERN = /[\p{Cc}\p{Cf}]/u

export function normalizePersonName(value) {
  return typeof value === 'string' ? value.normalize('NFC').trim().replace(/ +/g, ' ') : ''
}

export function getPersonNameError(value, { minLength = 2, label = 'nombre', requiredMessage } = {}) {
  if (typeof value !== 'string') return `El ${label} debe ser texto.`
  const name = normalizePersonName(value)
  if (!name) return requiredMessage || `Ingresa tu ${label}.`
  if (CONTROL_PATTERN.test(value)) return `El ${label} contiene caracteres no permitidos.`
  if (/\p{N}/u.test(name)) return `El ${label} no puede contener números.`
  if (!NAME_PATTERN.test(name)) return `El ${label} solo puede contener letras, espacios, guiones y apóstrofes.`
  if ([...name].length < minLength) return requiredMessage || `El ${label} debe tener al menos ${minLength} caracteres.`
  if ([...name].length > PERSON_NAME_MAX_LENGTH) return `El ${label} no puede superar los ${PERSON_NAME_MAX_LENGTH} caracteres.`
  return null
}

export function asForm(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

export function assertValidForm(errors) {
  if (Object.keys(errors).length) {
    throw Object.assign(new Error(Object.values(errors)[0]), { code: 'VALIDATION_ERROR', fieldErrors: errors })
  }
}
