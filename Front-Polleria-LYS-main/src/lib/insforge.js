import { createClient } from '@insforge/sdk';
import { getConfigurationError } from './insforgeConfig';

const baseUrl = import.meta.env.VITE_INSFORGE_BASE_URL;
const anonKey = import.meta.env.VITE_INSFORGE_ANON_KEY;
export const configurationError = getConfigurationError(baseUrl, anonKey);
export const insforge = configurationError ? null : createClient({ baseUrl, anonKey });
export function requireInsforge() {
  if (configurationError) throw new Error(configurationError);
  return insforge;
}
