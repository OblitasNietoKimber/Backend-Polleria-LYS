import { beforeAll, beforeEach, afterAll, expect, test } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
const db = new PGlite();
const roles=['cocina','cliente','cliente','mesera','admin','caja'];
const users=roles.map((_role,i)=>`60000000-0000-0000-0000-${String(i+1).padStart(12,'0')}`);
async function asUser(index,sql,params=[]) {
 await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[index===null?'':users[index] || index]);
 await db.exec(index===null?'SET ROLE anon':'SET ROLE authenticated');
 try{return await db.query(sql,params);}finally{await db.exec("RESET ROLE; SELECT set_config('request.jwt.claim.sub','',false)");}
}
async function create(type='recojo',items=[{id:1,qty:1}]) {
 const id=randomUUID();
 await asUser(1,'SELECT crear_pedido_cliente($1,$2,$3::jsonb,$4::jsonb,$5)',[id,type,JSON.stringify(items),JSON.stringify({name:'Cliente Prueba',phone:'987654321',address:'Av. Prueba 123'}),'efectivo']);
 return id;
}
async function salon(items=[{id:1,qty:1}]) {
 const id=randomUUID();await asUser(3,"SELECT abrir_pedido_salon($1,1,2,'Sin ají',$2::jsonb)",[id,JSON.stringify(items)]);return id;
}
const change=(id,from,to,user=0)=>asUser(user,'SELECT cambiar_estado_cocina($1,$2,$3)',[id,from,to]);
async function pay(id) {
 const row=(await db.query('SELECT total FROM pedidos WHERE id=$1',[id])).rows[0];
 return asUser(5,'SELECT registrar_cobro($1,$2,$3,$4,$5,$6)',[id,'efectivo',row.total,randomUUID(),row.total,null]);
}
beforeAll(async()=>{
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;
 CREATE TABLE auth.users(id uuid PRIMARY KEY,profile jsonb NOT NULL DEFAULT '{}');
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 GRANT USAGE ON SCHEMA auth,public TO anon,authenticated;
 CREATE SCHEMA realtime;
 CREATE TABLE realtime.channels(pattern text PRIMARY KEY,description text,enabled boolean);
 CREATE TABLE realtime.messages(channel_name text,event_name text,payload jsonb);
 GRANT USAGE ON SCHEMA realtime TO anon,authenticated;
 GRANT SELECT ON realtime.channels,realtime.messages TO anon,authenticated;
 GRANT INSERT ON realtime.messages TO anon,authenticated;
 CREATE FUNCTION realtime.channel_name() RETURNS text LANGUAGE sql STABLE AS $$ SELECT current_setting('test.channel',true) $$;
 CREATE FUNCTION realtime.publish(text,text,jsonb) RETURNS void LANGUAGE sql SECURITY DEFINER AS $$ INSERT INTO realtime.messages VALUES ($1,$2,$3) $$;
 REVOKE EXECUTE ON FUNCTION realtime.publish(text,text,jsonb) FROM PUBLIC,anon,authenticated;`);
 for(const directory of ['../../insforge/migrations/','../../migrations/']) {
  const base=new URL(directory,import.meta.url);
  for(const file of (await readdir(base)).filter(f=>f.endsWith('.sql')).sort())await db.exec(await readFile(new URL(file,base),'utf8'));
 }
 for(let i=0;i<roles.length;i++){await db.query('INSERT INTO auth.users(id) VALUES ($1)',[users[i]]);await db.query('UPDATE perfiles SET rol=$2 WHERE id=$1',[users[i],roles[i]]);}
},30000);
beforeEach(async()=>{await db.exec("TRUNCATE pedidos CASCADE; DELETE FROM realtime.messages; UPDATE mesas SET estado='libre'");});
afterAll(()=>db.close());

test('cocina consulta la mesa, productos vendidos y observaciones protegidos',async()=>{
 const id=await salon();
 expect((await asUser(0,'SELECT numero FROM mesas')).rows).toHaveLength(16);
 expect((await asUser(0,'SELECT notas,estado FROM pedidos WHERE id=$1',[id])).rows[0]).toEqual({notas:'Sin ají',estado:'pendiente'});
 expect((await asUser(0,'SELECT nombre_producto,cantidad FROM detalles_pedido WHERE pedido_id=$1',[id])).rows[0]).toMatchObject({nombre_producto:expect.any(String),cantidad:1});
});
test('avanza de nuevo a preparación y listo con usuario y fecha del servidor',async()=>{
 const id=await create();await change(id,'pendiente','en_preparacion');await change(id,'en_preparacion','listo');
 const history=(await asUser(1,'SELECT estado,estado_anterior,cambiado_por,cambiado_en FROM historial_estados_pedido WHERE pedido_id=$1 ORDER BY id',[id])).rows;
 expect(history.map(h=>h.estado)).toEqual(['pendiente','en_preparacion','listo']);
 expect(history[2]).toMatchObject({estado_anterior:'en_preparacion',cambiado_por:users[0]});expect(history[2].cambiado_en).toBeTruthy();
});
test.each(['listo','entregado','cancelado','inventado',null])('rechaza pendiente a %s sin cambiar el historial',async estado=>{
 const id=await create();await expect(change(id,'pendiente',estado)).rejects.toThrow(/no permitida/);
 expect((await db.query('SELECT estado FROM pedidos WHERE id=$1',[id])).rows[0].estado).toBe('pendiente');
 expect((await db.query('SELECT id FROM historial_estados_pedido WHERE pedido_id=$1',[id])).rows).toHaveLength(1);
});
test('compara el estado tras bloquear la fila y rechaza la segunda pantalla desactualizada',async()=>{
 const id=await create();await change(id,'pendiente','en_preparacion');
 await expect(change(id,'pendiente','en_preparacion')).rejects.toMatchObject({code:'40001'});
 await expect(change(id,'en_preparacion','pendiente')).rejects.toThrow(/no permitida/);
 expect((await db.query('SELECT id FROM historial_estados_pedido WHERE pedido_id=$1',[id])).rows).toHaveLength(2);
});
test.each([1,2,3,5,'60000000-0000-0000-0000-999999999999',null])('el usuario %s no usa la RPC de cocina',async user=>{
 const id=await create();await expect(change(id,'pendiente','en_preparacion',user)).rejects.toThrow();
});
test('no permite preparar pedidos sin productos ni pedidos inexistentes',async()=>{
 const id=await salon([]);await expect(change(id,'pendiente','en_preparacion')).rejects.toThrow(/contener productos/);
 await expect(change(randomUUID(),'pendiente','en_preparacion')).rejects.toThrow(/no existe/);
});
test('la validación también protege un UPDATE administrativo con contexto de cocina',async()=>{
 const id=await create();await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[users[0]]);
 try{await expect(db.query("UPDATE pedidos SET estado='listo' WHERE id=$1",[id])).rejects.toThrow(/no permitida/);}
 finally{await db.exec("SELECT set_config('request.jwt.claim.sub','',false)");}
 await expect(asUser(0,"UPDATE pedidos SET estado='listo' WHERE id=$1",[id])).rejects.toThrow(/permission denied/);
});
test('conserva el envío de meseras y no permite retroceder pedidos de cocina',async()=>{
 const id=await salon();await asUser(3,'SELECT enviar_pedido_cocina($1)',[id]);await change(id,'en_preparacion','listo');
 expect((await db.query('SELECT estado FROM pedidos WHERE id=$1',[id])).rows[0].estado).toBe('listo');
 await expect(change(id,'listo','en_preparacion')).rejects.toThrow(/no permitida/);
});
test.each(['pendiente','listo'])('caja sigue cerrando y liberando una mesa desde %s al confirmar su pago',async estado=>{
 const id=await salon();if(estado==='listo'){await change(id,'pendiente','en_preparacion');await change(id,'en_preparacion','listo');}
 await pay(id);
 expect((await db.query('SELECT estado,estado_pago FROM pedidos WHERE id=$1',[id])).rows[0]).toEqual({estado:'entregado',estado_pago:'pagado'});
 expect((await db.query('SELECT estado FROM mesas WHERE id=1')).rows[0].estado).toBe('libre');
 expect((await db.query("SELECT cambiado_por FROM historial_estados_pedido WHERE pedido_id=$1 AND estado='entregado'",[id])).rows[0].cambiado_por).toBe(users[5]);
});
test('no libera una mesa ni entrega desde cocina antes de cobrar',async()=>{
 const id=await salon();await change(id,'pendiente','en_preparacion');await change(id,'en_preparacion','listo');
 await expect(change(id,'listo','entregado')).rejects.toThrow(/no permitida/);
 await expect(asUser(3,'SELECT liberar_mesa_salon(1)')).rejects.toThrow(/pago/);
});
test('mantiene la protección de pedidos cobrados y permite cancelar una comanda vacía',async()=>{
 const id=await salon();await pay(id);await expect(change(id,'entregado','en_preparacion')).rejects.toThrow(/no permitida/);
 await expect(asUser(3,'SELECT agregar_o_modificar_detalles_salon($1,$2::jsonb)',[id,JSON.stringify([{id:1,qty:1}])])).rejects.toThrow(/finalizado/);
 const empty=await salon([]);await asUser(3,'SELECT liberar_mesa_salon(1)');
 expect((await db.query('SELECT estado FROM pedidos WHERE id=$1',[empty])).rows[0].estado).toBe('cancelado');
});
test('emite en canales privados sin incluir productos ni datos de contacto',async()=>{
 const id=await create();await db.exec('DELETE FROM realtime.messages');await change(id,'pendiente','en_preparacion');
 const rows=(await db.query('SELECT channel_name,payload FROM realtime.messages')).rows;
 expect(rows).toHaveLength(2);expect(rows.map(r=>r.channel_name)).toEqual(['lys:staff',`lys:client:${users[1]}`]);
 expect(rows.every(r=>JSON.stringify(r.payload)===JSON.stringify({pedidoId:id}))).toBe(true);
});
test('modificar detalles actualiza la sonda y publica sin duplicar auditoría',async()=>{
 const id=await salon();const before=(await db.query('SELECT actualizado_en FROM pedidos WHERE id=$1',[id])).rows[0].actualizado_en;
 await db.exec('DELETE FROM realtime.messages');await asUser(3,'SELECT agregar_o_modificar_detalles_salon($1,$2::jsonb)',[id,JSON.stringify([{id:1,qty:2}])]);
 expect((await db.query('SELECT actualizado_en FROM pedidos WHERE id=$1',[id])).rows[0].actualizado_en.getTime()).toBeGreaterThanOrEqual(before.getTime());
 expect((await db.query('SELECT channel_name FROM realtime.messages')).rows.length).toBeGreaterThan(0);
 expect((await db.query('SELECT id FROM historial_estados_pedido WHERE pedido_id=$1',[id])).rows).toHaveLength(1);
});
test('RLS restringe el canal al propietario incluso ante una política permisiva',async()=>{
 await db.exec('CREATE POLICY test_abierta ON realtime.channels FOR SELECT TO anon,authenticated USING(true)');
 try{
  await db.query("SELECT set_config('test.channel',$1,false)",[`lys:client:${users[1]}`]);
  expect((await asUser(1,'SELECT pattern FROM realtime.channels')).rows).toEqual([{pattern:'lys:client:%'}]);
  expect((await asUser(2,'SELECT pattern FROM realtime.channels')).rows).toEqual([]);
  expect((await asUser(0,'SELECT pattern FROM realtime.channels')).rows).toEqual([{pattern:'lys:staff'}]);
  expect((await asUser(null,'SELECT pattern FROM realtime.channels')).rows).toEqual([]);
 }finally{await db.exec('DROP POLICY test_abierta ON realtime.channels');}
});
test('no se pueden falsificar notificaciones desde SDK ni mediante INSERT',async()=>{
 await db.exec('CREATE POLICY test_publicar ON realtime.messages FOR INSERT TO authenticated WITH CHECK(true)');
 try{
  await expect(asUser(1,"INSERT INTO realtime.messages VALUES ('lys:staff','lys:pedido-actualizado','{}')")).rejects.toThrow(/row-level security/);
  await expect(asUser(0,"SELECT realtime.publish('lys:staff','lys:pedido-actualizado','{}')")).rejects.toThrow(/permission denied/);
 }finally{await db.exec('DROP POLICY test_publicar ON realtime.messages');}
});
