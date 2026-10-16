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
  assert.match(JSON.stringify(result.error), /permission denied|42501|forbidden|unauthorized/i);
}
denegado(await client.database.from('pagos').select('id').limit(1));
denegado(await client.database.rpc('registrar_cobro', {
  p_pedido_id: crypto.randomUUID(), p_metodo: 'efectivo', p_recibido: 50,
  p_idempotencia: crypto.randomUUID(), p_total_esperado: 42.9, p_referencia: null,
}));
console.log('Backend-Polleria-LYS: lectura de pagos y cobro anónimos rechazados. Sin modificar datos.');
