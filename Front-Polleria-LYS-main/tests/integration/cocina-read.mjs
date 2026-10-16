import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createClient } from '@insforge/sdk';
const local=Object.fromEntries((await readFile(new URL('../../.env.local',import.meta.url),'utf8')).split(/\r?\n/).filter(line=>/^[A-Z_]+=/.test(line)).map(line=>{const i=line.indexOf('=');return [line.slice(0,i),line.slice(i+1)];}));
const baseUrl=process.env.INSFORGE_BASE_URL||local.VITE_INSFORGE_BASE_URL;
const anonKey=process.env.INSFORGE_ANON_KEY||local.VITE_INSFORGE_ANON_KEY;
assert.match(baseUrl,/^https:\/\/b9zz47j5(?:-[a-z0-9]+)?\.us-east\.insforge\.app\/?$/);
assert.ok(anonKey&&!anonKey.startsWith('ik_'),'La comprobación requiere una clave pública.');
const client=createClient({baseUrl,anonKey});
const denied=result=>{assert.ok(result.error,'Se esperaba rechazar el acceso anónimo.');assert.match(JSON.stringify(result.error),/permission denied|42501|forbidden|unauthorized/i);};
denied(await client.database.from('pedidos').select('id').limit(1));
denied(await client.database.rpc('cambiar_estado_cocina',{p_pedido_id:crypto.randomUUID(),p_estado_actual:'pendiente',p_nuevo_estado:'en_preparacion'}));
try {
 await client.realtime.connect();
 assert.equal((await client.realtime.subscribe('lys:staff')).ok,false,'El canal de personal debe ser privado.');
 assert.equal((await client.realtime.subscribe('lys:client:'+crypto.randomUUID())).ok,false,'El canal del cliente debe ser privado.');
}finally{client.realtime.disconnect();}
console.log('Cocina: consultas, RPC y canales privados rechazan al visitante. Sin crear usuarios ni pedidos.');
