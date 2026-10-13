import { createClient } from '@insforge/sdk';
import { randomUUID, randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
const env = { API_BASE_URL: process.env.INSFORGE_BASE_URL, API_KEY: process.env.INSFORGE_API_KEY };
const anon = process.env.INSFORGE_ANON_KEY;
if (!env.API_BASE_URL || !env.API_KEY || !anon) throw new Error('Define INSFORGE_BASE_URL, INSFORGE_API_KEY e INSFORGE_ANON_KEY. Usa un entorno de desarrollo.');
async function sql(query) {
  const response = await fetch(`${env.API_BASE_URL}/api/database/advance/rawsql`, {
    method: 'POST', headers: { Authorization: `Bearer ${env.API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query }),
  });
  if (!response.ok) throw new Error(`SQL HTTP ${response.status}`);
  return response.json();
}
const fixtures=['cliente','cliente','mesera','cocina','caja','admin'].map((role,index)=>({id:randomUUID(),email:`lys-${randomUUID()}-${index}@example.test`,password:'Test123'+randomBytes(12).toString('hex'),role}));
const ids=fixtures.map(u=>`'${u.id}'`).join(','); const checks=[];
const orderId=randomUUID();
try {
 for(const u of fixtures) {
  await sql(`INSERT INTO auth.users(id,email,password,email_verified,profile) VALUES('${u.id}','${u.email}',crypt('${u.password}',gen_salt('bf')),true,'{"name":"Test"}'::jsonb); UPDATE public.perfiles SET rol='${u.role}' WHERE id='${u.id}';`);
  u.client=createClient({baseUrl:env.API_BASE_URL,anonKey:anon,isServerMode:true});
  const result=await u.client.auth.signInWithPassword({email:u.email,password:u.password});
  assert.equal(result.error,null,`Login ${u.role}: ${result.error?.message}`);
 }
 const a=fixtures[0].client,b=fixtures[1].client;
 const profiles=await a.database.from('perfiles').select('*');assert.equal(profiles.error,null);assert.equal(profiles.data.length,1);checks.push('Cliente ve solo su perfil');
 assert.ok((await a.database.from('perfiles').update({rol:'admin'}).eq('id',fixtures[0].id)).error);checks.push('Escalamiento de rol bloqueado');
 await a.auth.setProfile({rol:'admin'});assert.equal((await a.database.from('perfiles').select('rol').eq('id',fixtures[0].id).single()).data.rol,'cliente');checks.push('Metadata editable no cambia permisos');
 const created=await a.database.rpc('crear_pedido_cliente',{solicitud_id:orderId,tipo_entrega:'recojo',articulos:[{id:1,qty:2,price:0}],datos_entrega:{name:'Cliente',phone:'987654321'},metodo:'efectivo'});assert.equal(created.error,null,created.error?.message);
 const mine=await a.database.from('pedidos').select('*').eq('id',orderId).single();assert.equal(Number(mine.data.total),85.8);checks.push('Precio y propietario calculados por servidor');
 const retry=await a.database.rpc('crear_pedido_cliente',{solicitud_id:orderId,tipo_entrega:'recojo',articulos:[{id:1,qty:2}],datos_entrega:{name:'Cliente',phone:'987654321'},metodo:'efectivo'});assert.equal(retry.error,null);
 assert.equal((await a.database.from('detalles_pedido').select('*').eq('pedido_id',orderId)).data.length,1);checks.push('Reintento de pedido sin duplicados');
 assert.deepEqual((await b.database.from('pedidos').select('*').eq('id',orderId)).data,[]);assert.deepEqual((await b.database.from('detalles_pedido').select('*').eq('pedido_id',orderId)).data,[]);checks.push('Pedidos y detalles ajenos ocultos');
 assert.ok((await a.database.from('pedidos').update({total:0}).eq('id',orderId)).error);assert.ok((await a.database.from('pagos').insert([{pedido_id:orderId,registrado_por:fixtures[0].id,metodo:'efectivo',monto:1}])).error);checks.push('Totales y pagos falsos bloqueados');
 for(const u of fixtures.slice(2)) {const orders=await u.client.database.from('pedidos').select('*').eq('id',orderId);assert.equal(orders.error,null);assert.equal(orders.data.length,1);}
 checks.push('Personal autorizado puede consultar pedidos');
 const publicClient=createClient({baseUrl:env.API_BASE_URL,anonKey:anon,isServerMode:true});assert.equal((await publicClient.database.from('productos').select('*')).data.length,17);assert.ok((await publicClient.database.from('perfiles').select('*')).error);checks.push('Anonimo ve catalogo pero no perfiles');
console.log(JSON.stringify({checks},null,2));
} finally {
 await sql(`DELETE FROM public.detalles_pedido WHERE pedido_id='${orderId}'; DELETE FROM public.pedidos WHERE id='${orderId}' AND cliente_id IN (${ids}); DELETE FROM auth.users WHERE id IN (${ids});`);
}
