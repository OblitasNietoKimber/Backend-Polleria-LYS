import { test, expect } from './fixtures';
const ids={cocina:'00000000-0000-0000-0000-000000000031',cliente:'00000000-0000-0000-0000-000000000032'};
function fixture() {
 const row={id:'00000000-0000-0000-0000-000000000090',codigo:'LS-cocina-prueba',tipo:'recojo',estado:'pendiente',estado_pago:'pendiente',notas:'Sin ají',creado_en:new Date().toISOString(),actualizado_en:new Date().toISOString(),subtotal:'42.90',envio:'0',total:'42.90',destinatario:{name:'Cliente',phone:'987654321'},mesas:null,detalles_pedido:[{id:1,producto_id:1,cantidad:1,nombre_producto:'Pollo vendido',precio_unitario:'42.90'}]};
 const history=[{id:1,estado:'listo',cambiado_por:ids.cliente,cambiado_en:row.creado_en}];
 const sockets=new Set();const calls=[];let reject=false;
 function publish(){for(const {ws,channel} of sockets) ws.send('42'+JSON.stringify(['lys:pedido-actualizado',{pedidoId:row.id,meta:{channel,messageId:crypto.randomUUID(),senderType:'system',timestamp:new Date().toISOString()}}]));}
 async function install(page,role='cocina') {
  await page.addInitScript(()=>localStorage.setItem('lys_pedidos',JSON.stringify([{id:'PED-ANTIGUO',items:[],estadoCocina:'nuevo'}])));
  await page.routeWebSocket('**/socket.io/**',ws=>{
   ws.send('0'+JSON.stringify({sid:'socket-prueba',upgrades:[],pingInterval:25000,pingTimeout:20000,maxPayload:1000000}));
   ws.onMessage(message=>{
    const value=String(message);
    if(value.startsWith('40')) ws.send('40'+JSON.stringify({sid:'socket-prueba'}));
    const match=value.match(/^42(\d+)(\[.*)$/);
    if(match){const [event,payload]=JSON.parse(match[2]);if(event==='realtime:subscribe') {sockets.add({ws,channel:payload.channel});ws.send(`43${match[1]}`+JSON.stringify([{ok:true,channel:payload.channel,presence:{members:[]}}]));}}
    if(value==='2')ws.send('3');
   });
  });
  await page.route('https://b9zz47j5.us-east.insforge.app/**',async route=>{
   const request=route.request(),url=new URL(request.url());let response={},status=200;
   if(url.pathname==='/api/auth/refresh')response={user:{id:ids[role],email:`${role}@example.test`,emailVerified:true},accessToken:`${btoa('{"alg":"HS256"}')}.${btoa(JSON.stringify({sub:ids[role],exp:Math.floor(Date.now()/1000)+3600}))}.test`};
   else if(url.pathname.endsWith('/perfiles'))response={id:ids[role],rol:role,nombre:role};
   else if(url.pathname.endsWith('/rpc/cambiar_estado_cocina')) {
    const body=request.postDataJSON();calls.push(body);
    if(reject){status=409;response={message:'Otro usuario cambió este pedido. Actualiza el panel.',code:'40001'};}
    else {await new Promise(resolve=>setTimeout(resolve,100));row.estado=body.p_nuevo_estado;row.actualizado_en=new Date().toISOString();history.push({id:history.length+1,estado_anterior:body.p_estado_actual,estado:body.p_nuevo_estado,cambiado_por:ids.cocina,cambiado_en:new Date().toISOString()});response=row.id;publish();}
   } else if(url.pathname.endsWith('/pedidos')) {
    const mapped={...row,historial_estados_pedido:history};
    if(url.searchParams.get('select')==='estado')response={estado:row.estado};
    else if(url.searchParams.has('id'))response=mapped;
    else if(url.searchParams.get('estado')==='in.(listo,entregado)')response=['listo','entregado'].includes(row.estado)?[mapped]:[];
    else response=row.estado==='entregado'?[]:[mapped];
   } else if(url.pathname.endsWith('/historial_estados_pedido'))response=history;
   await route.fulfill({status,headers:{'content-range':'0-0/1'},contentType:'application/json',body:JSON.stringify(response)});
  });
 }
 return {row,calls,install,publish,sockets,reject:()=>{reject=true;}};
}
test('cocina consulta PostgreSQL, avanza estados y actualiza el seguimiento en otro navegador',async({browser,page})=>{
 const backend=fixture();await backend.install(page);
 const context=await browser.newContext();const client=await context.newPage();await backend.install(client,'cliente');
 await page.goto('/cocina');await client.goto('/pedidos/00000000-0000-0000-0000-000000000090');
 await expect(page.getByText('Sin ají')).toBeVisible();await expect(page.getByText('Pollo vendido')).toBeVisible();await expect(page.getByText('PED-ANTIGUO')).toHaveCount(0);
 await expect.poll(()=>backend.sockets.size).toBeGreaterThanOrEqual(2);
 await page.getByRole('button',{name:'Comenzar'}).click();await expect(page.getByRole('button',{name:'Marcar listo'})).toBeVisible();
 await expect(client.getByRole('region',{name:'Historial de estados'})).toContainText('En preparación');
 await page.getByRole('button',{name:'Marcar listo'}).click();await expect(page.getByText(/Listo para entrega/)).toBeVisible();await expect(page.getByRole('button',{name:'Entregar',exact:true})).toHaveCount(0);
 await expect(client.locator('.status-badge')).toHaveText('Listo');await expect(client.getByRole('region',{name:'Historial de estados'})).toContainText('Listo');
 expect(backend.calls).toEqual([{p_pedido_id:backend.row.id,p_estado_actual:'pendiente',p_nuevo_estado:'en_preparacion'},{p_pedido_id:backend.row.id,p_estado_actual:'en_preparacion',p_nuevo_estado:'listo'}]);
 await context.close();
});
test('rechazo de concurrencia deja el pedido visible y muestra el error',async({page})=>{
 const backend=fixture();backend.reject();await backend.install(page);await page.goto('/cocina');
 await page.getByRole('button',{name:'Comenzar'}).click();await expect(page.getByRole('alert')).toContainText('Otro usuario');await expect(page.getByRole('button',{name:'Comenzar'})).toBeEnabled();
});
test('filtra recojo y mantiene delivery listo para reparto sin entregar desde cocina',async({page})=>{
 const backend=fixture();backend.row.estado='listo';backend.row.tipo='delivery';await backend.install(page);await page.goto('/cocina');
 await expect(page.getByText(/Listo para reparto/)).toBeVisible();await expect(page.getByRole('button',{name:'Entregar',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Para llevar',exact:true}).click();await expect(page.getByText('Pollo vendido')).toHaveCount(0);
});
test('muestra entregados e historial del servidor en el panel móvil',async({page})=>{
 const backend=fixture();backend.row.estado='listo';await backend.install(page);await backend.installHistory?.();await page.setViewportSize({width:390,height:844});await page.goto('/cocina/historial');
 await expect(page.getByText('00000000-0000-0000-0000-000000000090').first()).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('recupera cambios por consulta automática cuando WebSocket no está disponible',async({page})=>{
 const backend=fixture();await backend.install(page);await page.routeWebSocket('**/socket.io/**',ws=>ws.close());await page.goto('/cocina');
 await expect(page.getByRole('button',{name:'Comenzar'})).toBeVisible();backend.row.estado='en_preparacion';backend.row.actualizado_en='2026-10-16T22:00:00Z';await expect(page.getByRole('button',{name:'Marcar listo'})).toBeVisible({timeout:8000});
});

test('actualiza la lista del cliente al recibir un cambio desde cocina',async({page})=>{
 const backend=fixture();await backend.install(page,'cliente');await page.goto('/pedidos');
 await expect(page.locator('.status-badge')).toHaveText('Recibido');
 await expect.poll(()=>backend.sockets.size).toBeGreaterThanOrEqual(1);
 backend.row.estado='listo';backend.publish();
 await expect(page.locator('.status-badge')).toHaveText('Listo',{timeout:4000});
});
