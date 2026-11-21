import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createClient } from '@insforge/sdk';
import { INSFORGE_PROJECT, getConfigurationError } from '../../src/lib/insforgeConfig.js';

const env = Object.fromEntries((await readFile(new URL('../../.env.local', import.meta.url), 'utf8'))
  .split(/\r?\n/).filter(line => /^[A-Z_]+=/.test(line)).map(line => {
    const equals = line.indexOf('='); return [line.slice(0, equals), line.slice(equals + 1)];
  }));
assert.equal(getConfigurationError(env.VITE_INSFORGE_BASE_URL, env.VITE_INSFORGE_ANON_KEY), null);
const client = createClient({ baseUrl: INSFORGE_PROJECT.baseUrl, anonKey: env.VITE_INSFORGE_ANON_KEY });
function denegado(result) {
  assert.ok(result.error, 'La operación anónima debe rechazarse.');
  assert.match(JSON.stringify(result.error), /permission denied|42501|forbidden|unauthorized|administrador/i);
}
denegado(await client.database.rpc('obtener_dashboard_admin', { p_desde: null, p_hasta: null }));
denegado(await client.database.rpc('obtener_historial_ventas', { p_desde: null, p_hasta: null, p_limite: 10, p_antes_fecha: null, p_antes_id: null }));
console.log('Backend-Polleria-LYS: dashboard e historial de ventas rechazados para el cliente anónimo. Sin modificar datos.');
