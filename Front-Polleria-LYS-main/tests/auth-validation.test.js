import { beforeEach, expect, test, vi } from 'vitest'

const fake = vi.hoisted(() => ({ signUp: vi.fn(), getCurrentUser: vi.fn(), from: vi.fn(), update: vi.fn(), verifyEmail: vi.fn(), resendVerificationEmail: vi.fn() }))
vi.mock('../src/lib/insforge', () => ({ insforge: null, requireInsforge: () => ({ auth: fake, database: { from: fake.from } }) }))
const valid = { nombre: 'María', apellido: 'Pérez', telefono: '987654321', email: 'persona@example.test', password: 'Clave12345', confirmPassword: 'Clave12345' }

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  const data = new Map()
  vi.stubGlobal('window', { location: { origin: 'http://localhost:5173' } })
  vi.stubGlobal('sessionStorage', { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) })
  vi.stubGlobal('localStorage', { removeItem: vi.fn() })
  fake.signUp.mockResolvedValue({ data: { requireEmailVerification: true } })
})

test.each([{ nombre: '123456' }, { apellido: 'Pérez9' }, { telefono: 987654321 }, { nombre: {} }, { password: 'sinNumero' }])('bloquea el registro directo antes del SDK y del correo: %j', changes => {
  return import('../src/services/authService').then(async auth => {
    await expect(auth.register({ ...valid, ...changes })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
    expect(fake.signUp).not.toHaveBeenCalled()
    expect(sessionStorage.getItem('lys_pending_profile')).toBeNull()
  })
})

test('un registro válido envía datos normalizados y no almacena contraseña ni rol', async () => {
  const auth = await import('../src/services/authService')
  await auth.register({ ...valid, nombre: '  Mari\u0301a  ', apellido: '  Pérez ', rol: 'admin' })
  expect(fake.signUp).toHaveBeenCalledWith(expect.objectContaining({ name: 'María Pérez' }))
  const pending = JSON.parse(sessionStorage.getItem('lys_pending_profile'))
  expect(pending).toEqual({ email: valid.email, nombre: 'María', apellido: 'Pérez', telefono: valid.telefono })
})

test('descarta datos de registro alterados en sessionStorage sin escribirlos al perfil', async () => {
  sessionStorage.setItem('lys_pending_profile', JSON.stringify({ ...valid, nombre: '123456' }))
  const profile = { id: 'cliente', nombre: 'Cliente', apellido: 'Prueba', telefono: '987654321', rol: 'cliente' }
  const query = { select: () => query, eq: () => query, single: async () => ({ data: profile }), update: fake.update }
  fake.from.mockReturnValue(query)
  fake.getCurrentUser.mockResolvedValue({ data: { user: { id: 'cliente', email: valid.email } } })
  const auth = await import('../src/services/authService')
  await auth.initializeAuth()
  expect(auth.getCurrentUser().nombre).toBe('Cliente')
  expect(fake.update).not.toHaveBeenCalled()
  expect(sessionStorage.getItem('lys_pending_profile')).toBeNull()
  fake.from.mockClear()
  await expect(auth.updateProfile({ ...valid, nombre: '9999' })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
  expect(fake.from).not.toHaveBeenCalled()
  await expect(auth.updatePreferences({ notificacionesEmail: 'false', notificacionesPromos: true })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
  expect(fake.from).not.toHaveBeenCalled()
})

test('un código o correo manipulado no llega a la API de verificación', async () => {
  const auth = await import('../src/services/authService')
  await expect(auth.verifyEmail({ email: valid.email, code: 'abc123' })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
  await expect(auth.resendVerification('correo-inválido')).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
  expect(fake.verifyEmail).not.toHaveBeenCalled()
  expect(fake.resendVerificationEmail).not.toHaveBeenCalled()
})
