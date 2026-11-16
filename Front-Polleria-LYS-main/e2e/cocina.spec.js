import { test, expect } from './fixtures';
const ids={cocina:'00000000-0000-0000-0000-000000000031',cliente:'00000000-0000-0000-0000-000000000032'};
function fixture() {
 const row={id:'00000000-0000-0000-0000-000000000090',codigo:'LS-cocina-prueba',tipo:'recojo',estado:'pendiente',estado_pago:'pendiente',metodo_solicitado:'efectivo',cocina_entregado_en:null,entregas_cocina:[],notas:'Sin ají',creado_en:new Date().toISOString(),actualizado_en:new Date().toISOString(),subtotal:'42.90',envio:'0',total:'42.90',destinatario:{name:'Cliente',phone:'987654321'},mesas:null,detalles_pedido:[{id:1,producto_id:1,cantidad:1,nombre_producto:'Pollo vendido',precio_unitario:'42.90'}]};
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
   } else if(url.pathname.endsWith('/rpc/entregar_pedido_cocina')) {
    const body=request.postDataJSON();calls.push(body);
    if(reject){status=409;response={message:'Otro usuario cambió este pedido. Actualiza el panel.',code:'40001'};}
    else {
     await new Promise(resolve=>setTimeout(resolve,150));
     row.cocina_entregado_en=new Date().toISOString();row.actualizado_en=row.cocina_entregado_en;
     row.entregas_cocina.push({items:row.detalles_pedido});
     if(row.tipo==='delivery')row.estado='en_camino';else if(row.tipo==='recojo'||row.estado_pago==='pagado')row.estado='entregado';
     response=row.id;publish();
    }
   } else if(url.pathname.endsWith('/rpc/obtener_historial_entregas_cocina')) {
    response=[{...row,historialId:'entrega-1',historial_estados_pedido:history,entregas_cocina:[],entregado_en:row.cocina_entregado_en || new Date().toISOString(),entregado_por:ids.cocina,preparado_en:history.at(-1).cambiado_en}];
   } else if(url.pathname.endsWith('/pedidos')) {
    const mapped={...row,historial_estados_pedido:history};
    if(url.searchParams.get('select')==='estado')response={estado:row.estado};
    else if(url.searchParams.has('id'))response=mapped;
    else if(url.searchParams.get('estado')==='in.(listo,entregado)')response=['listo','entregado'].includes(row.estado)?[mapped]:[];
    else response=['entregado','en_camino'].includes(row.estado)||row.cocina_entregado_en?[]:[mapped];
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
 await page.getByRole('button',{name:'Marcar listo'}).click();await expect(page.getByText(/Pendiente de cobro/)).toBeVisible();await expect(page.getByRole('button',{name:'Entregar',exact:true})).toBeDisabled();
 await expect(client.locator('.status-badge')).toHaveText('Listo');await expect(client.getByRole('region',{name:'Historial de estados'})).toContainText('Listo');
 expect(backend.calls).toEqual([{p_pedido_id:backend.row.id,p_estado_actual:'pendiente',p_nuevo_estado:'en_preparacion'},{p_pedido_id:backend.row.id,p_estado_actual:'en_preparacion',p_nuevo_estado:'listo'}]);
 await context.close();
});
test('rechazo de concurrencia deja el pedido visible y muestra el error',async({page})=>{
 const backend=fixture();backend.reject();await backend.install(page);await page.goto('/cocina');
 await page.getByRole('button',{name:'Comenzar'}).click();await expect(page.getByRole('alert')).toContainText('Otro usuario');await expect(page.getByRole('button',{name:'Comenzar'})).toBeEnabled();
});
test('sin la migracion de entregas el panel permite preparar y explica el boton deshabilitado',async({page})=>{
 const backend=fixture();await backend.install(page);
 await page.route('**/api/database/records/pedidos?*',async route=>{
  if(new URL(route.request().url()).searchParams.get('select')?.includes('entregas_cocina')) {
   await route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({code:'PGRST200',message:"Could not find a relationship between 'pedidos' and 'entregas_cocina' in the schema cache"})});
  } else await route.fallback();
 });
 await page.goto('/cocina');
 await expect(page.getByText('Pollo vendido')).toBeVisible();
 await page.getByRole('button',{name:'Comenzar'}).click();
 await page.getByRole('button',{name:'Marcar listo'}).click();
 await expect(page.getByRole('button',{name:'Entregar',exact:true})).toBeDisabled();
 await expect(page.getByText('La entrega de cocina aún no está habilitada en el servidor.',{exact:true})).toBeVisible();
 await page.reload();await expect(page.getByText('Pollo vendido')).toBeVisible();
 expect(backend.calls).toHaveLength(2);
});
test('filtra recojo y permite entregar delivery al repartidor',async({page})=>{
 const backend=fixture();backend.row.estado='listo';backend.row.tipo='delivery';await backend.install(page);await page.goto('/cocina');
 await expect(page.getByText(/Entrega al repartidor/)).toBeVisible();await expect(page.getByRole('button',{name:'Entregar',exact:true})).toBeEnabled();
 await page.getByRole('button',{name:'Para llevar',exact:true}).click();await expect(page.getByText('Pollo vendido')).toHaveCount(0);
});
test('muestra entregados e historial del servidor en el panel móvil',async({page})=>{
 const backend=fixture();backend.row.estado='listo';await backend.install(page);await backend.installHistory?.();await page.setViewportSize({width:390,height:844});await page.goto('/cocina/historial');
 await expect(page.locator('.cocina-finalizado-id').first()).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
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

test('solo muestra los platos de una comanda mixta',async({page})=>{
 const backend=fixture();
 backend.row.detalles_pedido.push({id:2,producto_id:14,cantidad:1,nombre_producto:'Bebida de prueba',requiere_preparacion:false});
 await backend.install(page);await page.goto('/cocina');
 await expect(page.getByText('Pollo vendido')).toBeVisible();
 await expect(page.getByText('Bebida de prueba')).toHaveCount(0);
});
test('un pedido de solo bebidas listo no aparece como trabajo de cocina',async({page})=>{
 const backend=fixture();backend.row.estado='listo';
 backend.row.detalles_pedido=[{id:2,producto_id:14,cantidad:1,nombre_producto:'Bebida de prueba',requiere_preparacion:false}];
 await backend.install(page);await page.goto('/cocina');
 await expect(page.getByRole('heading',{name:'Panel de Cocina',exact:true})).toBeVisible();
 await expect(page.locator('.cocina-board')).toHaveAttribute('aria-busy','false');
 await expect(page.getByText('Bebida de prueba')).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Comenzar'})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Marcar listo'})).toHaveCount(0);
});

test('entregar salón retira la tarjeta sin cambiar el pago y persiste al recargar',async({page})=>{
 const backend=fixture();backend.row.tipo='salon';backend.row.mesas={numero:'01'};backend.row.estado='listo';await backend.install(page);await page.goto('/cocina');
 const entregar=page.getByRole('button',{name:'Entregar',exact:true});await entregar.click();
 await expect(page.getByText('Pollo vendido')).toHaveCount(0);
 expect(backend.row.estado_pago).toBe('pendiente');expect(backend.row.estado).toBe('listo');
 expect(backend.calls).toHaveLength(1);expect(backend.calls[0]).toHaveProperty('p_actualizado_en');
 await page.reload();await expect(page.getByRole('heading',{name:'Panel de Cocina',exact:true})).toBeVisible();await expect(page.getByText('Pollo vendido')).toHaveCount(0);
 await page.goto('/cocina/historial');await expect(page.getByText(/Entregado:/)).toBeVisible();
});
test('delivery sale de cocina y el cliente lo ve en camino',async({browser,page})=>{
 const backend=fixture();backend.row.tipo='delivery';backend.row.estado='listo';await backend.install(page);
 const context=await browser.newContext();const client=await context.newPage();await backend.install(client,'cliente');
 await page.goto('/cocina');await client.goto(`/pedidos/${backend.row.id}`);
 await page.getByRole('button',{name:'Entregar',exact:true}).click();
 await expect(page.getByText('Pollo vendido')).toHaveCount(0);await expect(client.locator('.status-badge')).toHaveText('En camino');
 expect(backend.row.estado_pago).toBe('pendiente');await context.close();
});
test('rechazar la entrega conserva la tarjeta y permite reintentar',async({page})=>{
 const backend=fixture();backend.row.tipo='salon';backend.row.estado='listo';backend.reject();await backend.install(page);await page.goto('/cocina');
 await page.getByRole('button',{name:'Entregar',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Otro usuario');
 await expect(page.getByText('Pollo vendido')).toBeVisible();await expect(page.getByRole('button',{name:'Entregar',exact:true})).toBeEnabled();
});
test('recojo pagado permite entregar en móvil sin desbordar la tarjeta',async({page})=>{
 const backend=fixture();backend.row.estado='listo';backend.row.estado_pago='pagado';await backend.install(page);await page.setViewportSize({width:390,height:844});await page.goto('/cocina');
 await expect(page.getByRole('button',{name:'Entregar',exact:true})).toBeEnabled();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.getByRole('button',{name:'Entregar',exact:true}).click();await expect(page.getByText('Pollo vendido')).toHaveCount(0);expect(backend.row.estado).toBe('entregado');
});
