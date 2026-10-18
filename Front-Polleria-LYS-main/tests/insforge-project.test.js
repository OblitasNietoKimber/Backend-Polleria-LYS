import { expect, test } from 'vitest'
import { getConfigurationError, INSFORGE_PROJECT } from '../src/lib/insforgeConfig'

test('acepta la URL del proyecto Backend-Polleria-LYS con su clave pública', () => {
  expect(getConfigurationError(INSFORGE_PROJECT.baseUrl, 'public-key')).toBeNull()
  expect(getConfigurationError(`${INSFORGE_PROJECT.baseUrl}/`, 'public-key')).toBeNull()
})

test('rechaza la configuración anterior de Backend-LYS y otras URLs', () => {
  for (const url of ['https://mpy5z5dn.us-east.insforge.app', 'https://otro.us-east.insforge.app', 'no-es-url', `${INSFORGE_PROJECT.baseUrl}/api`]) {
    expect(getConfigurationError(url, 'public-key')).toContain('Backend-Polleria-LYS')
  }
})

test('no permite claves administrativas, placeholders ni variables ausentes', () => {
  for (const key of ['', undefined, 'ik_example-private-key', 'replace_with_public_anon_key']) {
    expect(getConfigurationError(INSFORGE_PROJECT.baseUrl, key)).toContain('clave pública')
  }
  expect(getConfigurationError(undefined, 'public-key')).not.toBeNull()
})
