// Backend de prueba aislado: PostgreSQL real (PGlite), RLS y RPC de las migraciones.
// Solo escucha loopback. No contiene credenciales ni conexiones a InsForge remoto.
import http from 'node:http';
import { randomBytes,createHmac,timingSafeEqual,scryptSync } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createLocalDatabase,asLocalUser,localUsers } from './local-db.mjs';
const port=Number(process.env.LOCAL_FLOW_PORT||5191);
const db=await createLocalDatabase(process.env.LOCAL_FLOW_MEMORY==='1'?undefined:fileURLToPath(new URL('../../../.datos-pruebas-atenciones/',import.meta.url)),{inventory:true});
if (process.env.LOCAL_FLOW_MEMORY === '1' && process.env.LOCAL_FLOW_TEST_CLOCK === '1') {
  await db.exec("CREATE OR REPLACE FUNCTION public.hora_lima_reservas() RETURNS time LANGUAGE sql STABLE SET search_path = '' AS $$ SELECT TIME '17:00' $$");
}
const secret=randomBytes(32),salt=randomBytes(16),password=scryptSync('Local123!',salt,32);
const sessions=new Map();
const sign=part=>createHmac('sha256',secret).update(part).digest('base64url');
function token(user){const part=Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:user.id,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url');return part+'.'+sign(part);}
function identity(req){const value=req.headers.authorization?.replace(/^Bearer /,'')||'';const parts=value.split('.');if(parts.length!==3)return null;const expected=sign(parts.slice(0,2).join('.'));if(expected.length!==parts[2].length||!timingSafeEqual(Buffer.from(expected),Buffer.from(parts[2])))return null;try{const claims=JSON.parse(Buffer.from(parts[1],'base64url'));return claims.exp>Date.now()/1000?localUsers.find(u=>u.id===claims.sub):null;}catch{return null;}}
const authUser=u=>({id:u.id,email:u.email,emailVerified:true,profile:{name:u.rol+' Local'}});
const reply=(res,status,data,headers={})=>{res.writeHead(status,{'Content-Type':'application/json',...headers});res.end(JSON.stringify(data));};
const identifier=value=>{if(!/^[a-z_][a-z_0-9]*$/.test(value))throw new Error('Identificador inválido');return '"'+value+'"';};
const tables=new Set(['productos_catalogo','perfiles','roles','categorias','productos','estados_pedido','pedidos','mesas','detalles_pedido','pagos','historial_estados_pedido','entregas_cocina','incidencias_atencion']);
function split(value){let depth=0,start=0;const result=[];for(let n=0;n<value.length;n++){if(value[n]==='(')depth++;if(value[n]===')')depth--;if(value[n]===','&&depth===0){result.push(value.slice(start,n));start=n+1;}}result.push(value.slice(start));return result.filter(Boolean);}
function projection(select,table,alias='t'){
 if(select==='*')return `to_jsonb(${alias})`;
 const fields=split(select).map(field=>{
  const match=field.match(/^(\w+)\((.*)\)$/);
  if(!match)return "'"+field.replaceAll("'",'')+"',"+alias+'.'+identifier(field);
  const [,relation,columns]=match;
  if(!tables.has(relation))throw new Error('Relación inválida');
  if(table==='pedidos'&&relation==='mesas')return `'mesas',(SELECT ${projection(columns,relation,'r')} FROM public.mesas r WHERE r.id=${alias}.mesa_id)`;
  if(table==='pedidos'&&['detalles_pedido','pagos','historial_estados_pedido','entregas_cocina','incidencias_atencion'].includes(relation))return `'${relation}',(SELECT COALESCE(jsonb_agg(${projection(columns,relation,'r')}),'[]'::jsonb) FROM public.${identifier(relation)} r WHERE r.pedido_id=${alias}.id)`;
  throw new Error('Relación no soportada en pruebas locales');
 });return 'jsonb_build_object('+fields.join(',')+')';
}
async function records(req,res,url,user,body){
 const table=url.pathname.split('/').at(-1);if(!tables.has(table))return reply(res,404,{message:'Tabla no disponible'});
 const values=[];const add=value=>{values.push(value);return '$'+values.length;};const filters=[];
 for(const [key,value] of url.searchParams){if(['select','order','limit','offset','on_conflict'].includes(key))continue;
  const column='t.'+identifier(key),dot=value.indexOf('.'),op=value.slice(0,dot),literal=value.slice(dot+1);
  if(op==='is'&&literal==='null')filters.push(column+' IS NULL');
  else if(op==='in'){const items=literal.replace(/^\(|\)$/g,'').split(',');filters.push(column+' IN ('+items.map(add).join(',')+')');}
  else if(['eq','neq','gt','gte','lt','lte','ilike'].includes(op))filters.push(column+' '+({eq:'=',neq:'<>',gt:'>',gte:'>=',lt:'<',lte:'<=',ilike:'ILIKE'}[op])+' '+add(literal));
  else throw new Error('Filtro no soportado');
 }
 const where=filters.length?' WHERE '+filters.join(' AND '):'';
 const output=await asLocalUser(db,user,async tx=>{
  if(req.method==='PATCH'){
   const changes=Object.entries(body).map(([key,value])=>identifier(key)+'='+add(typeof value==='object'?JSON.stringify(value):value));
   return (await tx.query(`UPDATE public.${identifier(table)} t SET ${changes.join(',')} ${where} RETURNING to_jsonb(t) AS data`,values)).rows.map(r=>r.data);
  }
   if(req.method==='POST'){
    const rows=Array.isArray(body)?body:[body];if(rows.length!==1)throw new Error('La prueba local admite una fila por inserción');const pairs=Object.entries(rows[0]);
    return (await tx.query(`INSERT INTO public.${identifier(table)} (${pairs.map(([key])=>identifier(key)).join(',')}) VALUES (${pairs.map(([,value])=>add(value!==null&&typeof value==='object'?JSON.stringify(value):value)).join(',')}) RETURNING to_jsonb(${identifier(table)}) AS data`,values)).rows.map(r=>r.data);
   }
   if(req.method==='DELETE')return (await tx.query(`DELETE FROM public.${identifier(table)} t${where} RETURNING to_jsonb(t) AS data`,values)).rows.map(r=>r.data);
   if(req.method!=='GET')throw Object.assign(new Error('Método no permitido'),{code:'42501'});
  const count=(await tx.query(`SELECT count(*) AS total FROM public.${identifier(table)} t${where}`,values)).rows[0].total;
  let order='';if(url.searchParams.get('order'))order=' ORDER BY '+url.searchParams.get('order').split(',').map(part=>{const [col,direction]=part.split('.');return 't.'+identifier(col)+(direction==='desc'?' DESC':' ASC');}).join(',');
  const range=req.headers.range?.split('-').map(Number);const offset=Math.max(0,Number(url.searchParams.get('offset')||range?.[0]||0));
  const limit=Math.min(200,Math.max(1,Number(url.searchParams.get('limit')||(range?range[1]-offset+1:100))));
  if(!Number.isSafeInteger(offset)||!Number.isSafeInteger(limit))throw new Error('Paginación inválida');
  const rows=(await tx.query(`SELECT ${projection(url.searchParams.get('select')||'*',table)} AS data FROM public.${identifier(table)} t${where}${order} LIMIT ${limit} OFFSET ${offset}`,values)).rows.map(r=>r.data);
  res.setHeader('Content-Range',`${offset}-${Math.max(offset,offset+rows.length-1)}/${count}`);return rows;
 });
 const single=req.headers.accept?.includes('application/vnd.pgrst.object+json');
 reply(res,200,single?(output[0]||null):output);
}
const allowedRPC=new Set(['ajustar_inventario','flujo_listar','flujo_mesas','flujo_sello','obtener_resumen_caja','flujo_operar','flujo_devoluciones','obtener_historial_entregas_cocina','crear_pedido_cliente','crear_pedido_cliente_tarjeta','obtener_dashboard_admin','obtener_historial_ventas','confirmar_entrega_delivery','registrar_cobro','cambiar_estado_cocina','entregar_pedido_cocina','obtener_actividad_salon','obtener_mesas_con_pedidos']);
const server=http.createServer(async(req,res)=>{
 const origin=req.headers.origin;
 if(origin&&!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin))return reply(res,403,{message:'Origen no autorizado'});
 res.setHeader('Access-Control-Allow-Origin',origin||'http://127.0.0.1:5180');res.setHeader('Vary','Origin');
 res.setHeader('Access-Control-Allow-Credentials','true');res.setHeader('Access-Control-Allow-Headers','Authorization,Content-Type,Accept,Prefer,Range,Range-Unit,X-CSRF-Token,X-Client-Info,X-InsForge-Client');
 res.setHeader('Access-Control-Expose-Headers','Content-Range');res.setHeader('Access-Control-Allow-Methods','GET,POST,PATCH,DELETE,OPTIONS');
 if(req.method==='OPTIONS'){res.writeHead(204);return res.end();}
 try{
  const url=new URL(req.url,`http://127.0.0.1:${port}`);let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>100000)throw new Error('Solicitud demasiado grande');}const body=raw?JSON.parse(raw):{};
  if(url.pathname==='/health')return reply(res,200,{mode:'local',database:'PostgreSQL/PGlite',remote:false});
  if(url.pathname==='/api/auth/public-config')return reply(res,200,{oAuthProviders:[],requireEmailVerification:false});
  if(url.pathname==='/api/auth/sessions'){
   const user=localUsers.find(u=>u.email===body.email);
   if(!user||!timingSafeEqual(password,scryptSync(String(body.password||''),salt,32)))return reply(res,401,{error:'INVALID_CREDENTIALS',message:'Credenciales locales incorrectas',statusCode:401});
   const key=randomBytes(32).toString('hex'),csrf=randomBytes(24).toString('hex');sessions.set(key,{user,csrf,expires:Date.now()+86400000});
   return reply(res,200,{user:authUser(user),accessToken:token(user),csrfToken:csrf},{'Set-Cookie':`local_refresh=${key}; HttpOnly; SameSite=Lax; Path=/`});
  }
  if(url.pathname==='/api/auth/refresh'){
   const key=req.headers.cookie?.match(/(?:^|;\s*)local_refresh=([^;]+)/)?.[1],session=sessions.get(key);
   if(!session||session.expires<Date.now())return reply(res,401,{message:'No hay sesión local',statusCode:401});
   if(req.headers['x-csrf-token']!==session.csrf)return reply(res,403,{message:'Invalid CSRF token',statusCode:403});
   return reply(res,200,{user:authUser(session.user),accessToken:token(session.user),csrfToken:session.csrf});
  }
  if(url.pathname==='/api/auth/logout'){
   const key=req.headers.cookie?.match(/(?:^|;\s*)local_refresh=([^;]+)/)?.[1],session=sessions.get(key);
   if(session&&req.headers['x-csrf-token']!==session.csrf)return reply(res,403,{message:'Invalid CSRF token',statusCode:403});
   sessions.delete(key);return reply(res,200,{success:true},{'Set-Cookie':'local_refresh=; Max-Age=0; HttpOnly; SameSite=Lax; Path=/'});
  }
  const user=identity(req);
  if(url.pathname==='/api/auth/sessions/current')return reply(res,user?200:401,{user:user?authUser(user):null});
  if(url.pathname.startsWith('/api/database/records/'))return await records(req,res,url,user,body);
  if(url.pathname.startsWith('/api/database/rpc/')){
   const name=url.pathname.split('/').at(-1);if(!allowedRPC.has(name))return reply(res,404,{message:'RPC no disponible'});
   const params=Object.entries(body);const result=await asLocalUser(db,user,tx=>tx.query(`SELECT public.${identifier(name)}(${params.map(([key],index)=>identifier(key)+' => $'+(index+1)).join(',')}) AS data`,params.map(([,value])=>value!==null&&typeof value==='object'?JSON.stringify(value):value)));
   return reply(res,200,result.rows[0].data);
  }
  return reply(res,404,{message:'Ruta no disponible en el entorno local'});
 }catch(error){const status=error.code==='42501'?403:error.code==='40001'?409:400;reply(res,status,{message:error.message,code:error.code||'LOCAL_ERROR',error:error.code||'LOCAL_ERROR',statusCode:status});}
});
server.listen(port,'127.0.0.1',()=>console.log(`Backend LOCAL: http://127.0.0.1:${port}. Usuarios: admin/mesera/cocina/caja/cliente@local.test · contraseña Local123!`));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(async()=>{await db.close();process.exitCode=0;}));
