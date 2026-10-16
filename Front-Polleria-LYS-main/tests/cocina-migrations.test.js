import { beforeEach,afterEach,expect,test,vi } from 'vitest';
import { readFile,readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const previousArgv=process.argv;let rows=[];const queries=[];
beforeEach(()=>{
 vi.resetModules();rows=[];queries.length=0;process.argv=['node','apply-migrations.mjs','--application','--from','20261016220000'];
 vi.stubEnv('INSFORGE_BASE_URL','https://example.test/');vi.stubEnv('INSFORGE_API_KEY','test-key');vi.spyOn(console,'log').mockImplementation(()=>{});
 vi.stubGlobal('fetch',vi.fn(async(_url,options)=>{const {query}=JSON.parse(options.body);queries.push(query);return {ok:true,json:async()=>({rows:query.startsWith('SELECT version')?rows:[]})};}));
});
afterEach(()=>{process.argv=previousArgv;vi.restoreAllMocks();vi.unstubAllEnvs();vi.unstubAllGlobals();});
test('selecciona solo las migraciones de cocina y registra cada checksum atómicamente',async()=>{
 await import('../../scripts/apply-migrations.mjs');const writes=queries.filter(query=>query.startsWith('DO $migration$'));
 expect(writes).toHaveLength(2);expect(writes[0]).toContain('cambiar_estado_cocina');expect(writes[1]).toContain('lys_canales_privados');
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
