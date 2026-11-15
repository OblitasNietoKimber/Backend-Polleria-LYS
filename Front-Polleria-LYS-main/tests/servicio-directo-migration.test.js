import { expect, test } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

test.each([
 { name: 'con todos los triggers', remove: [], mode: null },
 { name: 'sin notificación de detalles', remove: ['detalles_cocina_notificar'], mode: null },
 { name: 'sin notificaciones de cocina', remove: ['detalles_cocina_notificar','pedido_cocina_notificar'], mode: null },
 { name: 'con notificación configurada en réplica', remove: [], mode: 'REPLICA' },
])('instala y reintenta servicio directo $name conservando cobros y protecciones', async ({ remove, mode }) => {
 const db = new PGlite();
 try {
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
 for (const directory of ['../../insforge/migrations/', '../../migrations/']) {
  const root = new URL(directory, import.meta.url);
  for (const file of (await readdir(root)).filter(f => f.endsWith('.sql') && !f.startsWith('20261115')).sort()) await db.exec(await readFile(new URL(file, root), 'utf8'));
 }
 const client = randomUUID(), cashier = randomUUID(), waiter = randomUUID();
 for (const [id, role] of [[client,'cliente'],[cashier,'caja'],[waiter,'mesera']]) {
  await db.query('INSERT INTO auth.users(id) VALUES ($1)', [id]);
  await db.query('UPDATE perfiles SET rol=$2 WHERE id=$1', [id,role]);
 }
 const asUser = async (id, sql, params) => {
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [id]);
  await db.exec('SET ROLE authenticated');
  try { return await db.query(sql,params); }
  finally { await db.exec("RESET ROLE; SELECT set_config('request.jwt.claim.sub','',false)"); }
 };
 const drink = (await db.query("SELECT id FROM productos WHERE categoria_id='bebidas' AND disponible LIMIT 1")).rows[0].id;
 const paid = randomUUID(), pending = randomUUID(), paidDelivery = randomUUID();
 await asUser(waiter, "SELECT abrir_pedido_salon($1,1,2,'',$2::jsonb)", [paid,JSON.stringify([{id:drink,qty:1}])]);
 for (const [id,items] of [[pending,[{id:drink,qty:1}]],[paidDelivery,[{id:drink,qty:1},{id:1,qty:1}]]]) {
  await asUser(client, 'SELECT crear_pedido_cliente($1,$2,$3::jsonb,$4::jsonb,$5)',[id,'delivery',JSON.stringify(items),JSON.stringify({name:'Prueba',phone:'987654321',address:'Av. Prueba 123'}),'efectivo']);
 }
 for (const id of [paid,paidDelivery]) {
  const total = (await db.query('SELECT total FROM pedidos WHERE id=$1',[id])).rows[0].total;
  await asUser(cashier, 'SELECT registrar_cobro($1,$2,$3,$4,$5,NULL)',[id,'efectivo',1000,randomUUID(),total]);
 }
 const snapshot = async () => ({
  payments: (await db.query('SELECT * FROM pagos ORDER BY id')).rows,
  paidOrders: (await db.query('SELECT * FROM pedidos WHERE id=ANY($1::uuid[]) ORDER BY id',[[paid,paidDelivery]])).rows,
  lines: (await db.query("SELECT to_jsonb(d) - 'requiere_preparacion' AS row FROM detalles_pedido d ORDER BY id")).rows,
 });
 for (const name of remove) {
  const table = name === 'pedido_cocina_notificar' ? 'pedidos' : 'detalles_pedido';
  await db.exec(`DROP TRIGGER ${name} ON ${table}`);
 }
 if (mode) await db.exec(`ALTER TABLE detalles_pedido ENABLE ${mode} TRIGGER detalles_cocina_notificar`);
 const before = await snapshot();
 const enabled = async () => (await db.query("SELECT tgname,tgenabled FROM pg_trigger WHERE tgrelid='detalles_pedido'::regclass AND NOT tgisinternal ORDER BY tgname")).rows;
 const triggers = await enabled();
 const hasColumn = async () => (await db.query("SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='detalles_pedido' AND column_name='requiere_preparacion'")).rows.length;
 const old = await readFile(new URL('../../migrations/20261115010000_servicio-directo.sql', import.meta.url),'utf8');
 await expect(db.exec(`DO $old$ BEGIN ${old} END $old$;`)).rejects.toThrow(/pedido cobrado/);
 expect(await hasColumn()).toBe(0);
 expect(await snapshot()).toEqual(before);
 if (remove.length) {
  const previous = await readFile(new URL('../../migrations/20261115020000_servicio-directo-seguro.sql', import.meta.url),'utf8');
  await expect(db.exec(previous)).rejects.toThrow(/does not exist/);
  expect(await hasColumn()).toBe(0);
  expect(await enabled()).toEqual(triggers);
  expect(await snapshot()).toEqual(before);
 }
 const fixed = await readFile(new URL('../../migrations/20261115030000_servicio-directo-compatible.sql', import.meta.url),'utf8');
 const forcedError = fixed.replace(/\r?\nEND;\r?\n\$servicio_directo\$;/, "\nRAISE EXCEPTION 'fallo_controlado';\nEND;\n$servicio_directo$;");
 await expect(db.exec(forcedError)).rejects.toThrow(/fallo_controlado/);
 expect(await hasColumn()).toBe(0);
 expect(await enabled()).toEqual(triggers);
 expect(await snapshot()).toEqual(before);
 // Simula que un intento anterior dejó creada la columna antes de fallar.
 await db.exec('ALTER TABLE detalles_pedido ADD COLUMN requiere_preparacion boolean NOT NULL DEFAULT true');
 // Mismo bloque externo que utiliza el ejecutor de migraciones del repositorio.
 await db.exec(`DO $migration$ BEGIN EXECUTE $ddl$ ${fixed} $ddl$; END $migration$;`);
 expect(await snapshot()).toEqual(before);
 expect(await enabled()).toEqual(triggers);
 expect((await db.query('SELECT estado,estado_pago FROM pedidos WHERE id=$1',[pending])).rows[0]).toEqual({estado:'listo',estado_pago:'pendiente'});
 expect((await db.query('SELECT requiere_preparacion FROM detalles_pedido WHERE producto_id=$1',[drink])).rows.every(row=>row.requiere_preparacion===false)).toBe(true);
 await expect(db.query('UPDATE detalles_pedido SET cantidad=cantidad+1 WHERE pedido_id=$1',[paid])).rejects.toThrow(/pedido cobrado/);
 const after = await snapshot();
 await db.exec(fixed);
 expect(await snapshot()).toEqual(after);
 expect(await enabled()).toEqual(triggers);
 } finally { await db.close(); }
},30000);
