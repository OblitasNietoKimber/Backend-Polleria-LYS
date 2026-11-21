import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';

export const localUsers = ['admin','mesera','cocina','caja','cliente'].map((rol,index)=>({
  id:`70000000-0000-0000-0000-${String(index+1).padStart(12,'0')}`,rol,email:`${rol}@local.test`,
}));

async function applyRealtimeMigrations(db) {
  const directory = new URL('../../migrations/realtime/', import.meta.url);
  for (const name of (await readdir(directory)).filter(name => name.endsWith('.sql')).sort()) {
    await db.exec(await readFile(new URL(name, directory), 'utf8'));
  }
}

async function applyReservationValidation(db) {
  await db.exec(await readFile(new URL('../../migrations/validacion/20261120140000_reservas-validacion.sql', import.meta.url), 'utf8'));
}

export async function createLocalDatabase(dataDir, { beforePreview, inventory = false } = {}) {
  const db = new PGlite(dataDir);
  if ((await db.query("SELECT to_regclass('public.atenciones_salon') AS ready")).rows[0].ready) {
    if(inventory && !(await db.query("SELECT to_regclass('public.inventario_recursos') AS ready")).rows[0].ready)
      await db.exec(await readFile(new URL('../../migrations/inventario/20261116020000_inventario-compartido.sql',import.meta.url),'utf8'));
    if (!(await db.query("SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='pedidos' AND column_name='cuenta_principal_id'")).rows.length) {
      await db.exec(await readFile(new URL('../../migrations/atenciones/20261120181000_comandas_adicionales.sql', import.meta.url), 'utf8'));
    }
    await applyReservationValidation(db);
    await applyRealtimeMigrations(db);
    return db;
  }
  const baseline=(await db.query("SELECT to_regclass('public.perfiles') AS ready")).rows[0].ready;
  if(!baseline) {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY,profile jsonb NOT NULL DEFAULT '{}');
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA auth,public TO anon,authenticated;
    CREATE SCHEMA realtime;
    CREATE TABLE realtime.channels(pattern text PRIMARY KEY,description text,enabled boolean);
    CREATE TABLE realtime.messages(channel_name text,event_name text,payload jsonb);
    GRANT USAGE ON SCHEMA realtime TO anon,authenticated;
    GRANT SELECT ON realtime.channels,realtime.messages TO anon,authenticated;
    CREATE FUNCTION realtime.channel_name() RETURNS text LANGUAGE sql STABLE AS $$ SELECT current_setting('test.channel',true) $$;
    CREATE FUNCTION realtime.publish(text,text,jsonb) RETURNS void LANGUAGE sql SECURITY DEFINER AS $$ INSERT INTO realtime.messages VALUES ($1,$2,$3) $$;
    REVOKE EXECUTE ON FUNCTION realtime.publish(text,text,jsonb) FROM PUBLIC,anon,authenticated;`);
  for(const path of ['../../insforge/migrations/','../../migrations/']) {
    const directory=new URL(path,import.meta.url);
    for(const name of (await readdir(directory)).filter(name=>name.endsWith('.sql')).sort()) {
      await db.exec(await readFile(new URL(name,directory),'utf8'));
    }
  }
  }
  for(const user of localUsers) {
    await db.query('INSERT INTO auth.users(id) VALUES($1) ON CONFLICT DO NOTHING',[user.id]);
    await db.query('UPDATE public.perfiles SET rol=$2,nombre=$3,apellido=$4 WHERE id=$1',[user.id,user.rol,user.rol,'Local']);
  }
  await applyReservationValidation(db);
  if(beforePreview) await beforePreview(db);
  const preview=new URL('../../migrations/atenciones/',import.meta.url);
  for(const name of (await readdir(preview)).filter(name=>name.endsWith('.sql')).sort()) await db.exec(await readFile(new URL(name,preview),'utf8'));
  if(inventory) await db.exec(await readFile(new URL('../../migrations/inventario/20261116020000_inventario-compartido.sql',import.meta.url),'utf8'));
  await applyRealtimeMigrations(db);
  return db;
}

// Cada solicitud tiene su transacción y rol. El cliente nunca elige usuario o rol.
export async function asLocalUser(db,user,work) {
  return db.transaction(async tx=>{
    await tx.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[user?.id||'']);
    await tx.exec(user?'SET LOCAL ROLE authenticated':'SET LOCAL ROLE anon');
    return work(tx);
  });
}
