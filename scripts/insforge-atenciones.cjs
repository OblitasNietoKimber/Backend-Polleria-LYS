// Operación explícita y auditable. No imprime ni almacena la API key del MCP.
const fs=require('node:fs');const path=require('node:path');const {execFileSync,spawn}=require('node:child_process');const readline=require('node:readline');const {createHash}=require('node:crypto');
const root=path.resolve(__dirname,'..');const backupDir=path.resolve(root,'../respaldo-insforge-antes-integracion-20261115');
const project='7783e71f-8c16-4fd9-a2e6-24869bf1ec9f',nativeBackup='be7f453d-9290-446f-b258-17f6ec4e09c7';
const file='20261116010000_atenciones-salon.sql';
const codex=process.env.CODEX_CLI_PATH||execFileSync('powershell.exe',['-NoProfile','-Command','(Get-Command codex).Source'],{encoding:'utf8'}).trim();
const config=JSON.parse(execFileSync(codex,['mcp','get','insforge','--json'],{encoding:'utf8'}));
if(config.transport.env.API_BASE_URL!=='https://b9zz47j5.us-east.insforge.app')throw new Error('El MCP no apunta al proyecto esperado.');
const child=spawn('cmd.exe',['/d','/s','/c','npx -y @insforge/mcp@latest'],{env:{...process.env,...config.transport.env},windowsHide:true,stdio:['pipe','pipe','pipe']});
let id=0;const pending=new Map();child.stderr.on('data',()=>{});readline.createInterface({input:child.stdout}).on('line',line=>{try{const r=JSON.parse(line);if(pending.has(r.id)){pending.get(r.id)(r);pending.delete(r.id);}}catch{}});
const rpc=(method,params)=>new Promise(resolve=>{pending.set(++id,resolve);child.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');});
const timer=setTimeout(()=>{console.error('Tiempo de espera del MCP agotado.');child.kill();process.exit(1);},55000);
async function tool(name,args){const r=await rpc('tools/call',{name,arguments:args});if(r.error||r.result?.isError)throw new Error(r.result?.content?.map(x=>x.text||'').join('\n')||r.error?.message);return r.result;}
async function sql(query){const r=await tool('run-raw-sql',{query});const text=r.content.filter(x=>x.type==='text').map(x=>x.text).join('\n');const start=text.indexOf('{');return start<0?{}:JSON.parse(text.slice(start));}
const tables=['mesas','pedidos','detalles_pedido','pagos','historial_estados_pedido','actividades_salon','entregas_cocina','estados_pedido'];
const capture=`jsonb_build_object(${tables.map(t=>`'${t}',(SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY ${t==='estados_pedido'?'codigo':'id'}),'[]'::jsonb) FROM public.${t} t)`).join(',')})`;
const unchanged=`jsonb_build_object('pedidos',(SELECT md5(COALESCE(jsonb_agg(to_jsonb(p)-'atencion_id'-'version_cuenta'-'cocina_cancelada_en'-'actualizado_en' ORDER BY id)::text,'')) FROM public.pedidos p),'pagos',(SELECT md5(COALESCE(jsonb_agg(to_jsonb(p) ORDER BY id)::text,'')) FROM public.pagos p),'detalles',(SELECT md5(COALESCE(jsonb_agg(to_jsonb(d) ORDER BY id)::text,'')) FROM public.detalles_pedido d),'mesas',(SELECT md5(COALESCE(jsonb_agg(to_jsonb(m) ORDER BY id)::text,'')) FROM public.mesas m))`;
async function inspect(){return (await sql(`SELECT jsonb_build_object('entregas',to_regclass('public.entregas_cocina')::text,'atenciones',to_regclass('public.atenciones_salon')::text,'control',${unchanged},'pedidos',(SELECT count(*) FROM public.pedidos),'pagos',(SELECT count(*) FROM public.pagos),'cobrado',(SELECT COALESCE(sum(monto),0) FROM public.pagos)) AS state`)).rows[0].state;}
(async()=>{
 await rpc('initialize',{protocolVersion:'2024-11-05',capabilities:{},clientInfo:{name:'codex-atenciones',version:'2.0'}});child.stdin.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'})+'\n');
 const action=process.argv[2]||'inspect';
 if(action==='docs'){const r=await tool('fetch-docs',{docType:process.argv[3]||'instructions'});console.log(r.content.map(x=>x.text||'').join('\n'));}
 else if(action==='inspect')console.log(JSON.stringify(await inspect()));
 else if(action==='verify-rest'){
  const line=fs.readFileSync(path.join(root,'README.md'),'utf8').split('\n').find(line=>line.includes('**Administrador**'));
  const cells=line.split('|').map(s=>s.replaceAll('`','').trim());
  const login=await fetch(config.transport.env.API_BASE_URL+'/api/auth/sessions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:cells[2],password:cells[3]})});
  const session=await login.json();if(!login.ok||!session.accessToken)throw new Error('La cuenta de prueba documentada no pudo autenticarse. No se modificaron datos.');
  const headers={Authorization:'Bearer '+session.accessToken,'Content-Type':'application/json'};
  const response=await fetch(config.transport.env.API_BASE_URL+'/api/database/rpc/flujo_listar',{method:'POST',headers,body:JSON.stringify({p_pagina:0})});const data=await response.json();
  if(!response.ok)throw new Error(data.message||'Error al leer el flujo autenticado');
  const rest=await fetch(config.transport.env.API_BASE_URL+'/api/database/records/pedidos?'+new URLSearchParams({select:'id,version_cuenta,atencion_id,entregas_cocina(items),incidencias_atencion(id,estado)',limit:'1'}),{headers});
  const cookies=login.headers.getSetCookie?.().map(c=>c.split(';')[0]).join('; ')||'';
  await fetch(config.transport.env.API_BASE_URL+'/api/auth/logout',{method:'POST',headers:{...headers,Cookie:cookies,'X-CSRF-Token':session.csrfToken||''}});
  console.log(JSON.stringify({authenticated:true,flowStatus:response.status,relationshipStatus:rest.status,mesas:data.mesas.length,atenciones:data.atenciones.length,cuentas:data.cuentas.length}));
 }
 else if(action==='backup'){
  if(fs.existsSync(path.join(backupDir,'snapshot.json')))throw new Error('El respaldo ya existe; no se sobrescribe.');
  const query=`SELECT jsonb_build_object('data',${capture},'control',${unchanged},'functions',(SELECT jsonb_agg(jsonb_build_object('name',p.proname,'signature',p.oid::regprocedure::text,'definition',pg_get_functiondef(p.oid),'acl',p.proacl)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind='f'),'indexes',(SELECT jsonb_agg(to_jsonb(x)) FROM pg_indexes x WHERE schemaname='public'),'triggers',(SELECT jsonb_agg(pg_get_triggerdef(oid)) FROM pg_trigger WHERE NOT tgisinternal AND tgrelid IN (SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'))) AS snapshot`;
  const snapshot=(await sql(query)).rows[0].snapshot;
  fs.mkdirSync(backupDir,{recursive:true});fs.writeFileSync(path.join(backupDir,'snapshot.json'),JSON.stringify(snapshot,null,2));
  fs.writeFileSync(path.join(backupDir,'recuperacion.json'),JSON.stringify({project,nativeBackup,createdAt:new Date().toISOString(),checksum:createHash('sha256').update(JSON.stringify(snapshot)).digest('hex')},null,2));
  console.log(JSON.stringify({backup:backupDir,nativeBackup,pedidos:snapshot.data.pedidos.length,pagos:snapshot.data.pagos.length}));
 }
 else if(['preview','apply','patch-preview','patch-apply'].includes(action)){
  const patch=action.startsWith('patch-'),sourceFile=patch?'20261116011000_atenciones-concurrencia.sql':file;
  const snapshot=JSON.parse(fs.readFileSync(path.join(backupDir,'snapshot.json'),'utf8'));
  const source=fs.readFileSync(path.join(root,'migrations/atenciones',sourceFile),'utf8').replace(/\r\n/g,'\n');
  const checksum=createHash('sha256').update(source).digest('hex');const body=source.replace(/^--[^\n]*\n/gm,'').replace(/^\s*BEGIN;/,'').replace(/COMMIT;\s*$/,'');
  const transaction=`PERFORM pg_advisory_xact_lock(687242); LOCK TABLE public.mesas,public.pedidos,public.detalles_pedido,public.pagos IN SHARE ROW EXCLUSIVE MODE;
   ${patch?"IF to_regclass('public.atenciones_salon') IS NULL THEN RAISE EXCEPTION 'Falta la migración base'; END IF;":"IF to_regclass('public.atenciones_salon') IS NOT NULL THEN RAISE EXCEPTION 'La migración ya está instalada'; END IF;"}
   SELECT ${unchanged} INTO before_data;
   ${patch?'':`IF before_data IS DISTINCT FROM $control$${JSON.stringify(snapshot.control)}$control$::jsonb THEN RAISE EXCEPTION 'Los datos cambiaron desde el respaldo. Actualiza el respaldo antes de instalar.'; END IF;`}
   EXECUTE $ddl$${body}$ddl$;
   IF ${unchanged} IS DISTINCT FROM before_data THEN RAISE EXCEPTION 'Se alteraron datos existentes'; END IF;
   INSERT INTO public.schema_migrations(version,checksum) VALUES('${sourceFile}','${checksum}'); PERFORM pg_notify('pgrst','reload schema');`;
  const query=action.endsWith('preview')?`DO $preview$ DECLARE before_data jsonb; BEGIN BEGIN ${transaction} RAISE EXCEPTION USING ERRCODE='P0099',MESSAGE='Validado con rollback'; EXCEPTION WHEN SQLSTATE 'P0099' THEN NULL; END; END; $preview$;`:`DO $apply$ DECLARE before_data jsonb; BEGIN ${transaction} END; $apply$;`;
  await sql(query);console.log(JSON.stringify({action,checksum,...await inspect()}));
 }
 else if(action==='recovery-check'){
  const previous=JSON.parse(fs.readFileSync(path.join(backupDir,'snapshot.json'),'utf8'));const current=await inspect();
  console.log(JSON.stringify({nativeBackup,project,datosSinCambios:JSON.stringify(previous.control)===JSON.stringify(current.control),aviso:'Restaurar el respaldo nativo reemplaza los datos posteriores. El modo normal no ejecuta la restauración.'}));
 }
 else if(action==='export-current'){
  const current=await inspect();const data=(await sql(`SELECT ${capture} AS data`)).rows[0].data;
  if(current.atenciones){const extra=(await sql("SELECT jsonb_build_object('atenciones',(SELECT COALESCE(jsonb_agg(to_jsonb(t)),'[]'::jsonb) FROM public.atenciones_salon t),'incidencias',(SELECT COALESCE(jsonb_agg(to_jsonb(t)),'[]'::jsonb) FROM public.incidencias_atencion t),'operaciones',(SELECT COALESCE(jsonb_agg(to_jsonb(t)),'[]'::jsonb) FROM public.operaciones_atencion t)) AS data")).rows[0].data;Object.assign(data,extra);}
  const target=path.join(backupDir,'antes-de-restaurar-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json');fs.writeFileSync(target,JSON.stringify({current,data},null,2));console.log(JSON.stringify({export:target}));
 }
 else throw new Error('Acciones: docs, inspect, backup, preview, apply, recovery-check, export-current.');
 clearTimeout(timer);child.kill();process.exit(0);
})().catch(e=>{console.error(e.message.replace(/ik_[a-zA-Z0-9]+/g,'[ocultada]'));clearTimeout(timer);child.kill();process.exit(1);});
