import { beforeEach,afterEach,expect,test,vi } from 'vitest';
import { readFile,readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const previousArgv=process.argv;let rows=[];const queries=[];
beforeEach(()=>{
 vi.resetModules();rows=[];queries.length=0;process.argv=['node','apply-migrations.mjs','--application','--from','20261016220000'];
 vi.stubEnv('INSFORGE_BASE_URL','https://example.test/');vi.stubEnv('INSFORGE_API_KEY','test-key');vi.spyOn(console,'log').mockImplementation(()=>{});
 vi.stubGlobal('fetch',vi.fn(async(_url,options)=>{
  const {query}=JSON.parse(options.body);queries.push(query);
  if(query.startsWith('DO $migration$')){
   const match=query.match(/INSERT INTO public\.schema_migrations\(version,checksum\) VALUES \('([^']+)','([^']+)'\)/);
   if(match)rows.push({version:match[1],checksum:match[2]});
  }
  const version=query.match(/^SELECT checksum FROM public\.schema_migrations WHERE version = '([^']+)'/);
  return {ok:true,json:async()=>({rows:query.startsWith('SELECT version')?rows:version?rows.filter(row=>row.version===version[1]):[]})};
 }));
});
afterEach(()=>{process.argv=previousArgv;vi.restoreAllMocks();vi.unstubAllEnvs();vi.unstubAllGlobals();});
test('aplica desde las migraciones de cocina y registra cada checksum atómicamente',async()=>{
 await import('../../scripts/apply-migrations.mjs');const writes=queries.filter(query=>query.startsWith('DO $migration$'));
 expect(writes).toHaveLength(3);expect(writes[0]).toContain('cambiar_estado_cocina');expect(writes[1]).toContain('lys_canales_privados');expect(writes[2]).toContain('obtener_dashboard_admin');
 expect(writes.some(query=>query.includes('CREATE FUNCTION public.registrar_cobro'))).toBe(false);
 expect(writes.every(query=>query.includes('pg_advisory_xact_lock')&&query.includes('INSERT INTO public.schema_migrations'))).toBe(true);
 expect(queries.join('\n')).not.toContain('20261016194047_caja-pagos.sql');
});
test('omite versiones aplicadas y normaliza los saltos de línea para Windows',async()=>{
 const base=new URL('../../migrations/',import.meta.url);
 for(const file of (await readdir(base)).filter(file=>file>='20261016220000'&&file.endsWith('.sql')))rows.push({version:file,checksum:createHash('sha256').update((await readFile(new URL(file,base),'utf8')).replaceAll('\r\n','\n')).digest('hex')});
 await import('../../scripts/apply-migrations.mjs');expect(queries.some(query=>query.startsWith('DO $migration$'))).toBe(false);
});
test('rechaza una versión ya aplicada con otro contenido',async()=>{
 rows=[{version:'20261016220000_panel-cocina.sql',checksum:'alterado'}];await expect(import('../../scripts/apply-migrations.mjs')).rejects.toThrow(/modificada/);
});
test('no consulta el backend con un prefijo de migración inválido',async()=>{
 process.argv=['node','apply-migrations.mjs','--from',"nombre'alterado"];
 await expect(import('../../scripts/apply-migrations.mjs')).rejects.toThrow(/inválido/);expect(queries).toEqual([]);
});

test('comprueba todas las firmas antes de ejecutar la primera migración pendiente',async()=>{
 // Usar un nombre real posterior para verificar que una pendiente anterior no se escribe.
 const files=(await readdir(new URL('../../migrations/',import.meta.url))).filter(file=>file>='20261016220000'&&file.endsWith('.sql')).sort();
 rows=[{version:files.at(-1),checksum:'alterado'}];
 await expect(import('../../scripts/apply-migrations.mjs')).rejects.toThrow(/modificada/);
 expect(queries.some(query=>query.startsWith('DO $migration$'))).toBe(false);
});

test('detiene la ejecución si el backend no confirma el registro',async()=>{
 const original=globalThis.fetch;
 vi.stubGlobal('fetch',async(url,options)=>{
  const query=JSON.parse(options.body).query;
  if(query.startsWith('SELECT checksum'))return {ok:true,json:async()=>({rows:[]})};
  return original(url,options);
 });
 await expect(import('../../scripts/apply-migrations.mjs')).rejects.toThrow(/No se confirmó/);
 expect(queries.filter(query=>query.startsWith('DO $migration$'))).toHaveLength(1);
});
