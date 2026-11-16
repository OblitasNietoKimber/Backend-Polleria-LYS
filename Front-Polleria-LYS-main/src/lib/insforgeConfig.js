export const INSFORGE_PROJECT = {
  id: '7783e71f-8c16-4fd9-a2e6-24869bf1ec9f',
  name: 'Backend-Polleria-LYS',
  baseUrl: 'https://b9zz47j5.us-east.insforge.app',
}

export function getConfigurationError(baseUrl, anonKey, { localPreview = false } = {}) {
  if (!baseUrl || !anonKey || anonKey.startsWith('ik_') || anonKey === 'replace_with_public_anon_key') {
    return 'Configura VITE_INSFORGE_BASE_URL y VITE_INSFORGE_ANON_KEY en .env.local. Usa la clave pública, nunca la API key privada.'
  }
  if (localPreview && baseUrl === 'http://127.0.0.1:5191' && anonKey === 'local-public-anon') return null
  if (baseUrl.replace(/\/$/, '') !== INSFORGE_PROJECT.baseUrl) {
    return `La URL de InsForge debe corresponder a ${INSFORGE_PROJECT.name}: ${INSFORGE_PROJECT.baseUrl}. Obtén también la clave pública de ese proyecto.`
  }
  return null
}
