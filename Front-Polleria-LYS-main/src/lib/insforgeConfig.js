export const INSFORGE_PROJECT = {
  id: 'f3fe5475-d922-49e4-8d30-c0c61c118cfe',
  name: 'FIX-DB-LYS-NOV',
  baseUrl: 'https://8bwzqx2s.us-east.insforge.app',
}

export function getConfigurationError(baseUrl, anonKey, { localPreview = false, localPort = '5191' } = {}) {
  if (!baseUrl || !anonKey || anonKey.startsWith('ik_') || anonKey === 'replace_with_public_anon_key') {
    return 'Configura VITE_INSFORGE_BASE_URL y VITE_INSFORGE_ANON_KEY en .env.local. Usa la clave pública, nunca la API key privada.'
  }
  if (localPreview && /^[0-9]{1,5}$/.test(localPort) && baseUrl === 'http://127.0.0.1:' + localPort && anonKey === 'local-public-anon') return null
  if (baseUrl.replace(/\/$/, '') !== INSFORGE_PROJECT.baseUrl) {
    return `La URL de InsForge debe corresponder a ${INSFORGE_PROJECT.name}: ${INSFORGE_PROJECT.baseUrl}. Obtén también la clave pública de ese proyecto.`
  }
  return null
}
