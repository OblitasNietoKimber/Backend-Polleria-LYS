import { createClient } from '@insforge/sdk';

const baseUrl = import.meta.env.VITE_INSFORGE_BASE_URL;
const anonKey = import.meta.env.VITE_INSFORGE_ANON_KEY;
export const configurationError = !baseUrl || !anonKey || anonKey.startsWith('ik_') || anonKey === 'replace_with_public_anon_key'
  ? 'Configura VITE_INSFORGE_BASE_URL y VITE_INSFORGE_ANON_KEY en .env.local. Usa la clave pública, nunca la API key privada.'
  : null;
export const insforge = configurationError ? null : createClient({ baseUrl, anonKey });
export function requireInsforge() {
  if (configurationError) throw new Error(configurationError);
  return insforge;
}
