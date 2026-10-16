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
test('la validación también protege un UPDATE administrativo con contexto de cocina',async()=>{
 const id=await create();await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[users[0]]);
 try{await expect(db.query("UPDATE pedidos SET estado='listo' WHERE id=$1",[id])).rejects.toThrow(/no permitida/);}
 finally{await db.exec("SELECT set_config('request.jwt.claim.sub','',false)");}
 await expect(asUser(0,"UPDATE pedidos SET estado='listo' WHERE id=$1",[id])).rejects.toThrow(/permission denied/);
});
