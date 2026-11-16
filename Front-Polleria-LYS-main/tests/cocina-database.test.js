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
test.each(['pendiente','listo'])('caja cobra desde %s y conserva la mesa hasta entregar los platos',async estado=>{
 const id=await salon();if(estado==='listo'){await change(id,'pendiente','en_preparacion');await change(id,'en_preparacion','listo');}
 await pay(id);
 expect((await db.query('SELECT estado,estado_pago FROM pedidos WHERE id=$1',[id])).rows[0]).toEqual({estado,estado_pago:'pagado'});
 expect((await db.query('SELECT estado FROM mesas WHERE id=1')).rows[0].estado).toBe('ocupada');
 if(estado==='pendiente') {await change(id,'pendiente','en_preparacion');await change(id,'en_preparacion','listo');}
 await deliver(id);
 expect(await state(id)).toBe('entregado');
 expect((await db.query('SELECT estado FROM mesas WHERE id=1')).rows[0].estado).toBe('libre');
});
test('no libera una mesa ni entrega desde cocina antes de cobrar',async()=>{
 const id=await salon();await change(id,'pendiente','en_preparacion');await change(id,'en_preparacion','listo');
 await expect(change(id,'listo','entregado')).rejects.toThrow(/no permitida/);
 await expect(asUser(3,'SELECT liberar_mesa_salon(1)')).rejects.toThrow(/pago/);
});
test('mantiene la protección de pedidos cobrados y permite cancelar una comanda vacía',async()=>{
 const id=await salon();await ready(id);await pay(id);await deliver(id);await expect(change(id,'entregado','en_preparacion')).rejects.toThrow(/no permitida/);
 await expect(asUser(3,'SELECT agregar_o_modificar_detalles_salon($1,$2::jsonb)',[id,JSON.stringify([{id:1,qty:1}])])).rejects.toThrow(/cobrado|finalizado/);
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

async function directProduct(category) {
 await db.query("INSERT INTO categorias(id,nombre) VALUES ($1,$1) ON CONFLICT DO NOTHING",[category]);
 return (await db.query("INSERT INTO productos(categoria_id,nombre,precio,disponible) VALUES ($1,$2,5,true) RETURNING id",[category,`Servicio ${category}`])).rows[0].id;
}
const state=async id=>(await db.query('SELECT estado FROM pedidos WHERE id=$1',[id])).rows[0].estado;
const edit=(id,items)=>asUser(3,'SELECT agregar_o_modificar_detalles_salon($1,$2::jsonb)',[id,JSON.stringify(items)]);
test.each(['bebidas','postres'])('solo %s queda listo en salón, recojo y delivery sin preparar ni cobrar',async category=>{
 const product=await directProduct(category);
 for(const type of ['salon','recojo','delivery']) {
  const id=type==='salon'?await salon([{id:product,qty:1}]):await create(type,[{id:product,qty:1}]);
  expect(await state(id)).toBe('listo');
  expect((await db.query('SELECT estado_pago FROM pedidos WHERE id=$1',[id])).rows[0].estado_pago).toBe('pendiente');
  expect((await db.query('SELECT requiere_preparacion FROM detalles_pedido WHERE pedido_id=$1',[id])).rows[0].requiere_preparacion).toBe(false);
  expect((await db.query('SELECT estado FROM historial_estados_pedido WHERE pedido_id=$1 ORDER BY id',[id])).rows.map(r=>r.estado)).toEqual(['pendiente','listo']);
  await expect(change(id,'listo','en_preparacion')).rejects.toThrow();
  if(type==='salon') await pay(id);
 }
});
test('un pedido mixto conserva bebidas e importes pero espera a cocina',async()=>{
 const drink=await directProduct('bebidas');const id=await create('delivery',[{id:drink,qty:2},{id:1,qty:1}]);
 expect(await state(id)).toBe('pendiente');
 const rows=(await db.query('SELECT producto_id,requiere_preparacion FROM detalles_pedido WHERE pedido_id=$1 ORDER BY producto_id',[id])).rows;
 expect(rows).toHaveLength(2);expect(rows.find(r=>r.producto_id===drink).requiere_preparacion).toBe(false);
 await change(id,'pendiente','en_preparacion');await change(id,'en_preparacion','listo');
 await pay(id);expect((await db.query('SELECT monto FROM pagos WHERE pedido_id=$1',[id])).rows[0].monto).toBe((await db.query('SELECT total FROM pedidos WHERE id=$1',[id])).rows[0].total);
});
test('editar bebidas no reabre platos listos; agregar un plato sí los devuelve a cocina',async()=>{
 const drink=await directProduct('bebidas');const id=await salon([{id:1,qty:1}]);
 await change(id,'pendiente','en_preparacion');await change(id,'en_preparacion','listo');
 await edit(id,[{id:1,qty:1},{id:drink,qty:2}]);expect(await state(id)).toBe('listo');
 await edit(id,[{id:1,qty:2},{id:drink,qty:2}]);expect(await state(id)).toBe('pendiente');
 await edit(id,[{id:drink,qty:1}]);expect(await state(id)).toBe('listo');
 await edit(id,[{id:drink,qty:3}]);expect(await state(id)).toBe('listo');
 await edit(id,[]);expect(await state(id)).toBe('pendiente');
});
test('agregar comida a un pedido de bebidas lo envía al flujo de preparación',async()=>{
 const drink=await directProduct('bebidas');const id=await salon([{id:drink,qty:1}]);
 await edit(id,[{id:drink,qty:1},{id:1,qty:1}]);expect(await state(id)).toBe('pendiente');
 await asUser(3,'SELECT enviar_pedido_cocina($1)',[id]);expect(await state(id)).toBe('en_preparacion');
 await edit(id,[{id:drink,qty:1}]);expect(await state(id)).toBe('listo');
});
test('el cliente no puede invocar la función interna para falsificar estados',async()=>{
 const id=await create();await expect(asUser(1,'SELECT ajustar_estado_servicio($1,true)',[id])).rejects.toThrow(/permission denied/);
});

async function ready(id) {await change(id,'pendiente','en_preparacion');await change(id,'en_preparacion','listo');}
async function version(id) {return (await db.query('SELECT actualizado_en::text AS version FROM pedidos WHERE id=$1',[id])).rows[0].version;}
async function deliver(id,stamp,user=0) {return asUser(user,'SELECT entregar_pedido_cocina($1,$2)',[id,stamp || await version(id)]);}
const kitchenHistory=async (user=0,offset=0)=>(await asUser(user,'SELECT obtener_historial_entregas_cocina(50,$1) AS data',[offset])).rows[0].data;
test('entregar salón retira la comanda, conserva la cuenta y audita sin cobrar ni liberar',async()=>{
 const id=await salon();await ready(id);const stamp=await version(id);await deliver(id,stamp);
 expect((await db.query('SELECT estado,estado_pago,cocina_entregado_en,cocina_entregado_por FROM pedidos WHERE id=$1',[id])).rows[0]).toMatchObject({estado:'listo',estado_pago:'pendiente',cocina_entregado_en:expect.any(Date),cocina_entregado_por:users[0]});
 expect((await db.query('SELECT * FROM pagos')).rows).toHaveLength(0);
 expect((await db.query("SELECT id FROM pedidos WHERE cocina_entregado_en IS NULL AND estado IN ('pendiente','en_preparacion','listo')")).rows).toHaveLength(0);
 expect((await db.query('SELECT estado FROM mesas WHERE id=1')).rows[0].estado).toBe('ocupada');
 const history=await kitchenHistory();expect(history).toHaveLength(1);expect(history[0]).toMatchObject({id,entregado_por:users[0],detalles_pedido:[{producto_id:1,cantidad:1}]});
 const mesas=(await asUser(3,'SELECT obtener_mesas_con_pedidos() AS data')).rows[0].data;
 expect(mesas.find(m=>m.id===1)).toMatchObject({pedido_id:id,estado_pago:'pendiente',cocina_entregado_en:expect.any(String)});
 await pay(id);expect(await state(id)).toBe('entregado');expect((await db.query('SELECT estado FROM mesas WHERE id=1')).rows[0].estado).toBe('libre');
 // Reintento perdido después de cerrar y reutilizar la mesa.
 await salon();await deliver(id,stamp);expect((await db.query('SELECT estado FROM mesas WHERE id=1')).rows[0].estado).toBe('ocupada');
 expect((await db.query('SELECT * FROM entregas_cocina WHERE pedido_id=$1',[id])).rows).toHaveLength(1);
});
test('después de entregar solo las cantidades añadidas regresan a cocina y cada entrega queda en historial',async()=>{
 const drink=await directProduct('bebidas');const id=await salon();await ready(id);await deliver(id);
 await edit(id,[{id:1,qty:1},{id:drink,qty:2}]);expect(await state(id)).toBe('listo');
 expect((await db.query('SELECT cocina_entregado_en FROM pedidos WHERE id=$1',[id])).rows[0].cocina_entregado_en).not.toBeNull();
 await edit(id,[{id:1,qty:3},{id:drink,qty:2}]);expect(await state(id)).toBe('pendiente');
 await ready(id);await deliver(id);
 const history=await kitchenHistory();expect(history).toHaveLength(2);
 expect(history.map(h=>h.detalles_pedido[0].cantidad)).toEqual([2,1]);
 await expect(edit(id,[{id:1,qty:2}])).rejects.toThrow(/ya entregados/);
 expect((await kitchenHistory()).length).toBe(2);
});
test('rechaza entregar una versión vieja tras editar la comanda o cobrar',async()=>{
 const id=await salon();await ready(id);const old=await version(id);await edit(id,[{id:1,qty:2}]);
 await expect(deliver(id,old)).rejects.toThrow(/Otro usuario/);
 expect((await db.query('SELECT * FROM entregas_cocina')).rows).toHaveLength(0);
 await ready(id);const beforePay=await version(id);await pay(id);
 await expect(deliver(id,beforePay)).rejects.toThrow(/Otro usuario/);
 await deliver(id);expect(await state(id)).toBe('entregado');
});
test('bloquea liberar una mesa prepagada mientras cocina prepara o espera entregar',async()=>{
 const id=await salon();await pay(id);
 await expect(asUser(3,'SELECT liberar_mesa_salon(1)')).rejects.toThrow(/entrega/);
 await expect(asUser(3,"UPDATE mesas SET estado='libre' WHERE id=1")).rejects.toThrow(/entrega/);
 await expect(edit(id,[{id:1,qty:2}])).rejects.toThrow(/cobrado/);
 await ready(id);await expect(asUser(3,'SELECT liberar_mesa_salon(1)')).rejects.toThrow(/entrega/);
 await deliver(id);expect(await state(id)).toBe('entregado');
});
test('recojo exige pago confirmado y entregarlo no duplica cobros',async()=>{
 const id=await create();await ready(id);await expect(deliver(id)).rejects.toThrow(/pago en caja/);
 expect((await db.query('SELECT * FROM entregas_cocina')).rows).toHaveLength(0);
 await pay(id);const stamp=await version(id);await deliver(id,stamp);await deliver(id,stamp);
 expect(await state(id)).toBe('entregado');expect((await db.query('SELECT * FROM pagos')).rows).toHaveLength(1);
});
test('delivery contra entrega sale en camino sin marcar pagado y caja confirma el destino tras el cobro',async()=>{
 const id=await create('delivery');await ready(id);await deliver(id);
 expect((await db.query('SELECT estado,estado_pago FROM pedidos WHERE id=$1',[id])).rows[0]).toEqual({estado:'en_camino',estado_pago:'pendiente'});
 await expect(asUser(5,'SELECT confirmar_entrega_delivery($1)',[id])).rejects.toThrow(/cobro/);
 await pay(id);expect(await state(id)).toBe('en_camino');
 await asUser(5,'SELECT confirmar_entrega_delivery($1)',[id]);await asUser(5,'SELECT confirmar_entrega_delivery($1)',[id]);
 expect(await state(id)).toBe('entregado');
 expect((await db.query('SELECT estado FROM historial_estados_pedido WHERE pedido_id=$1 ORDER BY id',[id])).rows.map(h=>h.estado)).toEqual(['pendiente','en_preparacion','listo','en_camino','entregado']);
});
test.each(['tarjeta','yape','plin'])('delivery de %s debe confirmar su cobro antes de salir',async metodo=>{
 const id=await create('delivery');await db.query('UPDATE pedidos SET metodo_solicitado=$2 WHERE id=$1',[id,metodo]);await ready(id);
 await expect(deliver(id)).rejects.toThrow(/pago en caja/);await pay(id);await deliver(id);expect(await state(id)).toBe('en_camino');
});
test.each([1,2,3,5,null])('el usuario %s no puede entregar ni consultar el historial de cocina',async user=>{
 const id=await salon();await ready(id);await expect(deliver(id,undefined,user)).rejects.toThrow(/cocina|permission denied/);
 await expect(kitchenHistory(user)).rejects.toThrow(/cocina|permission denied/);
});
test('cocina no puede escribir entregas directamente ni confirmar delivery en destino',async()=>{
 const id=await create('delivery');await ready(id);await deliver(id);
 await expect(asUser(0,'DELETE FROM entregas_cocina WHERE pedido_id=$1',[id])).rejects.toThrow(/permission denied/);
 await expect(asUser(0,'SELECT confirmar_entrega_delivery($1)',[id])).rejects.toThrow(/Solo caja/);
 expect((await asUser(1,'SELECT * FROM entregas_cocina')).rows).toHaveLength(0);
 expect((await asUser(0,'SELECT * FROM entregas_cocina')).rows).toHaveLength(1);
});
test('entregar publica cambios sin incluir datos personales y revierte todo si falla el cierre',async()=>{
 const id=await salon();await ready(id);await pay(id);await db.exec('DELETE FROM realtime.messages');
 await db.exec("CREATE FUNCTION fallar_entrega() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Fallo cierre'; END; $$; CREATE TRIGGER zz_fallar BEFORE UPDATE ON mesas FOR EACH ROW EXECUTE FUNCTION fallar_entrega();");
 try {await expect(deliver(id)).rejects.toThrow(/Fallo cierre/);} finally {await db.exec('DROP TRIGGER zz_fallar ON mesas; DROP FUNCTION fallar_entrega()');}
 expect((await db.query('SELECT * FROM entregas_cocina')).rows).toHaveLength(0);expect(await state(id)).toBe('listo');
 await deliver(id);const messages=(await db.query('SELECT payload FROM realtime.messages')).rows;
 expect(messages.length).toBeGreaterThan(0);expect(messages.every(m=>JSON.stringify(m.payload)===JSON.stringify({pedidoId:id}))).toBe(true);
});

test('no permite entregar sin preparar, con versión nula o invocando la RPC de estados antigua',async()=>{
 const id=await salon();await expect(deliver(id)).rejects.toThrow(/no está listo/);
 await ready(id);await expect(asUser(0,'SELECT entregar_pedido_cocina($1,NULL)',[id])).rejects.toThrow(/Otro usuario/);
 await expect(change(id,'listo','entregado',4)).rejects.toThrow(/no permitida/);
 expect((await db.query('SELECT * FROM entregas_cocina')).rows).toHaveLength(0);
});
test('conserva pedidos históricos cerrados sin inventar entregas y pagina las entregas nuevas',async()=>{
 const old=await create();await db.query("UPDATE pedidos SET estado='entregado' WHERE id=$1",[old]);
 const id=await salon();await ready(id);await deliver(id);
 const history=await kitchenHistory();expect(history).toHaveLength(2);
 expect(history.find(h=>h.id===old)).toMatchObject({esAnterior:true});
 expect(history.find(h=>h.id===old)).not.toHaveProperty('entregado_en');
 const first=(await asUser(0,'SELECT obtener_historial_entregas_cocina(1,0) AS data')).rows[0].data;
 const second=(await asUser(0,'SELECT obtener_historial_entregas_cocina(1,1) AS data')).rows[0].data;
 expect(new Set([...first,...second].map(h=>h.historialId)).size).toBe(2);
 for(const args of [[0,0],[101,0],[50,-1],[null,0],[50,null]]) await expect(asUser(0,'SELECT obtener_historial_entregas_cocina($1,$2)',args)).rejects.toThrow(/Página/);
});
