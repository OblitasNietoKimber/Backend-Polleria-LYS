import {test,expect} from '@playwright/test';
async function login(page,role){
 await page.goto('/login');await page.getByLabel('Correo electrónico',{exact:true}).fill(`${role}@local.test`);await page.getByLabel('Contraseña',{exact:true}).fill('Local123!');await page.getByRole('button',{name:'Iniciar sesión',exact:true}).click();await expect(page).toHaveURL(/\/$/);
}
async function rpc(page,action,data){return page.evaluate(async({action,data})=>{
 const {operateFlow}=await import('/src/services/atencionService.js');return operateFlow(action,data);
},{action,data});}
async function snapshot(page){return page.evaluate(async()=>{const {getFlow}=await import('/src/services/atencionService.js');return getFlow();});}
test('recorrido real de mesas, caja y cocina con PostgreSQL local y perfiles separados',async({browser})=>{
 const mesera=await browser.newContext(),caja=await browser.newContext(),cocina=await browser.newContext();
 const m=await mesera.newPage(),c=await caja.newPage(),k=await cocina.newPage();
 await login(m,'mesera');await login(c,'caja');await login(k,'cocina');
 await m.goto('/mesas/01/pedido');await m.locator('.plato-card').filter({has:m.getByText('Pollo a la brasa entero',{exact:true})}).getByTitle('Agregar a la comanda',{exact:true}).click();await m.getByRole('button',{name:'Confirmar comanda',exact:true}).click();await expect(m).toHaveURL(/\/mesas$/);
 await m.getByRole('button',{name:/Mesa 01/}).click();await m.getByRole('button',{name:'Solicitar cuenta para caja',exact:true}).click();
 await c.goto('/caja');await expect(c.getByRole('tab',{name:/Por cobrar\s*1/,exact:true})).toBeVisible();await c.getByLabel('Monto recibido').fill('100');await c.getByRole('button',{name:/^Cobrar S\//}).click();await expect(c.getByRole('dialog')).toBeVisible();await c.getByRole('button',{name:'Cerrar comprobante',exact:true}).click();
 await k.goto('/cocina');await k.getByRole('button',{name:'Comenzar',exact:true}).click();await k.getByRole('button',{name:'Marcar listo',exact:true}).click();await k.getByRole('button',{name:'Entregar',exact:true}).click();await expect(k.getByRole('button',{name:'Entregar',exact:true})).toHaveCount(0);
 await m.reload();await m.getByRole('button',{name:/Mesa 01/}).click();await expect(m.getByRole('button',{name:/Mesa 01/})).toContainText(/ocupada/i);await expect(m.getByRole('button',{name:'Abrir cuenta adicional',exact:true})).toBeVisible();
 await m.getByRole('button',{name:'Abrir cuenta adicional',exact:true}).click();await m.locator('.plato-card').filter({has:m.getByText('Pollo a la brasa entero',{exact:true})}).getByTitle('Agregar a la comanda',{exact:true}).click();await m.getByRole('button',{name:'Confirmar comanda',exact:true}).click();
 await m.getByRole('button',{name:/Mesa 01/}).click();await expect(m.getByRole('button',{name:'Cerrar atención y liberar mesa',exact:true})).toBeDisabled();
 await c.getByRole('button',{name:'Actualizar pedidos',exact:true}).click();await c.getByRole('tab',{name:/Cuentas abiertas\s*1/,exact:true}).click();await expect(c.getByRole('button',{name:/^Cobrar S\//})).toBeDisabled();
 await c.getByLabel('Confirmo el cobro anticipado.').check();await c.getByLabel('Monto recibido').fill('100');await c.getByRole('button',{name:/^Cobrar S\//}).click();await expect(c.getByRole('dialog')).toBeVisible();
 await k.reload();await k.getByRole('button',{name:'Comenzar',exact:true}).click();await k.getByRole('button',{name:'Marcar listo',exact:true}).click();await k.getByRole('button',{name:'Entregar',exact:true}).click();
 await m.reload();await m.getByRole('button',{name:/Mesa 01/}).click();await m.getByLabel('Los clientes se retiraron y la mesa está disponible.').check();await m.getByRole('button',{name:'Cerrar atención y liberar mesa',exact:true}).click();await expect(m.getByRole('button',{name:/Mesa 01/})).toContainText(/libre/i);
 await k.goto('/cocina/historial');await expect(k.getByText(/Entregado:/)).toHaveCount(2);
 await mesera.close();await caja.close();await cocina.close();
});
test('permiso del servidor rechaza identidad falsa; catálogo, perfil e historial del cliente siguen operativos',async({page})=>{
 await login(page,'cliente');await page.goto('/catalogo');await expect(page.getByText('Pollo a la brasa entero',{exact:true}).first()).toBeVisible();
 await page.goto('/profile');await expect(page.getByLabel('Nombre',{exact:true})).toHaveValue('cliente');
 await page.goto('/pedidos');await expect(page.getByText('Mis pedidos',{exact:true}).first()).toBeVisible();
 await page.goto('/mesas');await expect(page).toHaveURL(/\/profile$/);
 const result=await page.evaluate(async()=>{const {operateFlow}=await import('/src/services/atencionService.js');try{await operateFlow('abrir',{mesa:2,rol:'admin',items:[{id:1,qty:1}]});return 'unexpected';}catch(e){return e.message;}});
 expect(result).toMatch(/personal/);
});
test('editar invalida cuentas antiguas, cancelación autorizada y diseño móvil sin desbordar',async({browser})=>{
 const ctx=await browser.newContext(),adminCtx=await browser.newContext(),kitchenCtx=await browser.newContext();const m=await ctx.newPage(),a=await adminCtx.newPage(),k=await kitchenCtx.newPage();
 await login(m,'mesera');await login(a,'admin');await login(k,'cocina');
 const {pedido}=await rpc(m,'abrir',{mesa:2,items:[{id:1,qty:1}]});let p=(await snapshot(m)).cuentas.find(p=>p.id===pedido);
 await rpc(m,'solicitar',{pedido,version:p.version_cuenta});p=(await snapshot(m)).cuentas.find(p=>p.id===pedido);await rpc(m,'reabrir',{pedido,version:p.version_cuenta});
 p=(await snapshot(k)).cuentas.find(p=>p.id===pedido);await rpc(k,'comenzar',{pedido,version:p.version_cuenta});p=(await snapshot(m)).cuentas.find(p=>p.id===pedido);await rpc(m,'incidencia',{pedido,version:p.version_cuenta,motivo:'Cliente solicita anulación'});
 await a.goto('/mesas');await a.getByRole('button',{name:/Mesa 02/}).click();await a.getByRole('button',{name:'Autorizar solicitud',exact:true}).click();await k.goto('/cocina');await k.getByRole('button',{name:'Confirmar detención de cocina',exact:true}).click();
 await expect(k.getByRole('button',{name:'Marcar listo',exact:true})).toHaveCount(0);
 for(const [page,path] of [[m,'/mesas'],[a,'/caja'],[k,'/cocina']]){await page.setViewportSize({width:390,height:844});await page.goto(path);await expect(page.getByRole('heading',{level:1})).toBeVisible();if(path==='/mesas')await expect(page.getByRole('button',{name:/Mesa 01/})).toBeVisible();if(path==='/caja')await expect(page.getByRole('tab',{name:/Cobrados\s*2/})).toBeVisible();if(path==='/cocina')await expect(page.getByRole('heading',{name:'Nuevos pedidos',exact:true})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:`test-results/flujo-${path.slice(1)}-movil.png`,fullPage:true});}
 await ctx.close();await adminCtx.close();await kitchenCtx.close();
});
test('checkout e historial del cliente, reparto y dashboard funcionan con el esquema nuevo real',async({browser})=>{
 const clientCtx=await browser.newContext(),staffCtx=await browser.newContext();const client=await clientCtx.newPage(),staff=await staffCtx.newPage();
 await login(client,'cliente');await login(staff,'admin');
 await client.evaluate(()=>{
  localStorage.setItem('lys-cart',JSON.stringify({1:1}));
  localStorage.setItem('lys-checkout-delivery',JSON.stringify({deliveryType:'delivery',form:{name:'Cliente Local',phone:'987654321',address:'Av. Prueba 123',reference:''}}));
  localStorage.setItem('lys-checkout-payment','efectivo');
 });
 await client.goto('/checkout/resumen');await client.getByRole('button',{name:/Confirmar pedido/}).click();await expect(client.getByText('¡Pedido confirmado!',{exact:true})).toBeVisible();await client.getByRole('link',{name:'Ver mi pedido',exact:true}).click();
 const orderId=await client.locator('h1.order-detail-id').getAttribute('title');await expect(client.getByRole('region',{name:'Historial de estados'})).toContainText('Recibido');
 let p=(await snapshot(staff)).cuentas.find(p=>p.id===orderId);await rpc(staff,'comenzar',{pedido:orderId,version:p.version_cuenta});p=(await snapshot(staff)).cuentas.find(p=>p.id===orderId);await rpc(staff,'listo',{pedido:orderId,version:p.version_cuenta});p=(await snapshot(staff)).cuentas.find(p=>p.id===orderId);await rpc(staff,'entregar',{pedido:orderId,version:p.version_cuenta});
 await client.reload();await expect(client.locator('.status-badge')).toHaveText('En camino');
 p=(await snapshot(staff)).cuentas.find(p=>p.id===orderId);await rpc(staff,'cobrar',{pedido:orderId,version:p.version_cuenta,metodo:'efectivo',recibido:100});p=(await snapshot(staff)).cuentas.find(p=>p.id===orderId);await rpc(staff,'confirmar_delivery',{pedido:orderId,version:p.version_cuenta});
 await client.reload();await expect(client.locator('.status-badge')).toHaveText('Entregado');
 await staff.goto('/dashboard');await expect(staff.locator('.admin-history-table')).toContainText('Cliente Local');await expect(staff.getByText(/Devoluciones realizadas en el periodo/)).toBeVisible();
 await clientCtx.close();await staffCtx.close();
});
test('perder la respuesta después de cobrar permite recuperar el comprobante sin duplicar el pago',async({browser})=>{
 const adminCtx=await browser.newContext(),cashCtx=await browser.newContext();const a=await adminCtx.newPage(),c=await cashCtx.newPage();await login(a,'admin');await login(c,'caja');
 const {pedido}=await rpc(a,'abrir',{mesa:3,items:[{id:1,qty:1}]});let p=(await snapshot(a)).cuentas.find(p=>p.id===pedido);await rpc(a,'solicitar',{pedido,version:p.version_cuenta});
 let lost=false;await c.route('**/api/database/rpc/flujo_operar',async route=>{if(!lost&&route.request().postDataJSON().p_accion==='cobrar'){lost=true;await route.fetch();await route.abort('failed');}else await route.continue();});
 await c.goto('/caja');await c.getByLabel('Monto recibido').fill('100');await c.getByRole('button',{name:/^Cobrar S\//}).click();await expect(c.getByRole('button',{name:'Reintentar el mismo cobro',exact:true})).toBeVisible();
 const original=(await snapshot(a)).cuentas.find(p=>p.id===pedido).pago;
 await c.getByRole('button',{name:'Reintentar el mismo cobro',exact:true}).click();await expect(c.getByRole('dialog')).toBeVisible();
 p=(await snapshot(a)).cuentas.find(p=>p.id===pedido);expect(p.pago.id).toBe(original.id);await adminCtx.close();await cashCtx.close();
});

test('stock compartido se descuenta desde mesas, bloquea el catálogo y administración repone',async({browser})=>{
 const ac=await browser.newContext(),mc=await browser.newContext(),cc=await browser.newContext();
 const a=await ac.newPage(),m=await mc.newPage(),c=await cc.newPage();
 await login(a,'admin');await login(m,'mesera');
 await a.evaluate(async()=>{
  const {getProduct}=await import('/src/services/productService.js');const {requireInsforge}=await import('/src/lib/insforge.js');
  const p=await getProduct(1);if(p.inventoryAvailable!==1){const {error}=await requireInsforge().database.rpc('ajustar_inventario',{p_producto_id:1,p_cantidad:1-p.inventoryAvailable,p_motivo:'Conteo inicial de prueba aislada',p_operacion:crypto.randomUUID()});if(error)throw error;}
 });
 await m.goto('/mesas/15/pedido');
 const whole=m.locator('.plato-card').filter({has:m.getByText('Pollo a la brasa entero',{exact:true})});
 await whole.getByRole('button').click();
 await expect(m.locator('.plato-card').filter({has:m.getByText('1/2 Pollo a la brasa',{exact:true})}).getByRole('button')).toBeDisabled();
 await m.getByRole('button',{name:'Confirmar comanda',exact:true}).click();await expect(m).toHaveURL(/\/mesas$/);
 await c.goto('/catalogo');const card=c.locator('.ticket-card').filter({has:c.getByText('Pollo a la brasa entero',{exact:true})});
 await expect(card.getByRole('button',{name:'Agotado',exact:true})).toBeDisabled();
 await a.goto('/admin/productos');const control=a.locator('.admin-stock-control').first();
 await control.getByRole('button',{name:'Ajustar existencias',exact:true}).click();
 await control.getByLabel(/Cantidad a añadir/).fill('2');await control.getByLabel('Motivo',{exact:true}).fill('Reposición de dos pollos de prueba');
 await control.getByRole('button',{name:'Guardar ajuste',exact:true}).click();
 await expect(control).toContainText('2 porciones disponibles');
 await c.reload();await expect(card.getByRole('button',{name:'Agregar',exact:true})).toBeEnabled();
 await a.evaluate(async()=>{const {requireInsforge}=await import('/src/lib/insforge.js');const {error}=await requireInsforge().database.rpc('ajustar_inventario',{p_producto_id:1,p_cantidad:198,p_motivo:'Saldo para siguientes pruebas aisladas',p_operacion:crypto.randomUUID()});if(error)throw error;});
 await ac.close();await mc.close();await cc.close();
});

test('reserva limita el celular y respeta la capacidad aunque se cambien los atributos del formulario', async ({ page }) => {
 await login(page, 'mesera');
 await page.goto('/mesas');
 await page.getByRole('button', { name: /Mesa 08/ }).click();
 await page.getByRole('button', { name: 'Reservar esta mesa' }).click();
 await page.clock.setFixedTime(new Date('2020-01-01T22:00:00Z'));
 await expect(page.getByRole('heading', { name: /Reserva para hoy/ })).toBeVisible();

 const nombre = page.getByLabel('Nombre del cliente / grupo:');
 const telefono = page.getByLabel('Celular de contacto (opcional):');
 const comensales = page.getByLabel('Comensales:');
 const hora = page.getByLabel('Hora programada:');
 const guardar = page.getByRole('button', { name: 'Guardar reserva' });
 await expect(hora).toHaveValue('');
 await nombre.fill('Familia Gómez42');
 await expect(nombre).toHaveValue('Familia Gómez');
 await telefono.fill('9876543210');
 await expect(telefono).toHaveValue('');
 await expect(page.getByRole('alert')).toContainText('hasta 9 dígitos');

 await telefono.fill('987 654 321');
 await guardar.click();
 await expect(page.getByRole('alert')).toContainText('Ingresa una hora válida');
 await hora.fill('14:00');
 await guardar.click();
 await expect(page.getByRole('alert')).toContainText('hora posterior a la actual');
 await hora.evaluate(input => input.removeAttribute('max'));
 await hora.fill('23:00');
 await guardar.click();
 await expect(page.getByRole('alert')).toContainText('horario de atención');
 await expect(rpc(page, 'reservar', { mesa: 8, cliente: 'Familia Gómez', hora: '14:00', telefono: '987654321', comensales: 4 })).rejects.toThrow(/hora posterior/);
 await hora.fill('20:00');

 await comensales.evaluate(input => input.removeAttribute('max'));
 await comensales.fill('5');
 await page.getByRole('button', { name: 'Guardar reserva' }).click();
 await expect(page.getByRole('alert')).toContainText('entre 1 y 4');

 await expect(rpc(page, 'reservar', { mesa: 8, cliente: 'Familia Gómez', hora: '20:00', telefono: '9876543210', comensales: 4 })).rejects.toThrow(/9 dígitos/);
 await comensales.fill('4');
 await page.getByRole('button', { name: 'Guardar reserva' }).click();
 await expect(page.getByRole('button', { name: /Mesa 08/ })).toContainText(/reservada/i);
});

test('confirmar comanda pide confirmar cuando las porciones suman más de diez pollos', async ({ page }) => {
 await login(page, 'mesera');
 const agregar = nombre => page.locator('.plato-card').filter({ has: page.getByText(nombre, { exact: true }) })
   .getByTitle('Agregar a la comanda', { exact: true });
 const confirmar = page.getByRole('button', { name: 'Confirmar comanda', exact: true });

 await page.goto('/mesas/10/pedido');
 for (let i = 0; i < 10; i++) await agregar('Pollo a la brasa entero').click();
 await confirmar.click();
 await expect(page).toHaveURL(/\/mesas$/);

 await page.goto('/mesas/09/pedido');
 for (let i = 0; i < 10; i++) await agregar('Pollo a la brasa entero').click();
 await agregar('1/2 Pollo a la brasa').click();
 await agregar('1/2 Pollo a la brasa').click();

 const [mensaje] = await Promise.all([
  page.waitForEvent('dialog').then(async dialog => {
   const message = dialog.message();
   await dialog.dismiss();
   return message;
  }),
  confirmar.click(),
 ]);
 expect(mensaje).toContain('11 pollos');
 await expect(page).toHaveURL(/\/mesas\/09\/pedido$/);
 await expect(page.locator('.stepper-qty')).toHaveText(['10', '2']);
 expect((await snapshot(page)).cuentas.some(cuenta => Number(cuenta.mesa_id) === 9)).toBe(false);

 page.once('dialog', dialog => dialog.accept());
 await confirmar.click();
 await expect(page).toHaveURL(/\/mesas$/);
 await expect(page.getByRole('button', { name: /Mesa 09/ })).toContainText(/ocupada/i);
});


test('la mesera envía una comanda adicional durante la preparación y caja emite un recibo', async ({ browser }) => {
  const [m, k, c] = await Promise.all([browser.newPage(), browser.newPage(), browser.newPage()]);
  try {
    await Promise.all([login(m, 'mesera'), login(k, 'cocina'), login(c, 'caja')]);
    await m.goto('/mesas/04/pedido');
    await m.locator('.plato-card').filter({ has: m.getByText('Pollo a la brasa entero', { exact: true }) })
      .getByTitle('Agregar a la comanda', { exact: true }).click();
    await m.getByRole('button', { name: 'Confirmar comanda', exact: true }).click();
    await expect(m).toHaveURL(/\/mesas$/);

    await k.goto('/cocina');
    const ticket = k.locator('.cocina-card').filter({ hasText: /Mesa 04/ });
    await ticket.getByRole('button', { name: 'Comenzar', exact: true }).click();
    await expect(ticket.getByRole('button', { name: 'Marcar listo', exact: true })).toBeVisible();
    await m.reload();
    await m.getByRole('button', { name: /Mesa 04/ }).click();
    await expect(m.getByRole('button', { name: 'Editar comanda', exact: true })).toHaveCount(0);
    await m.getByRole('button', { name: 'Nueva comanda para esta mesa', exact: true }).click();
    await expect(m.locator('.comanda-item')).toHaveCount(0);
    await m.locator('.plato-card').filter({ has: m.getByText('1/2 Pollo a la brasa', { exact: true }) })
      .getByTitle('Agregar a la comanda', { exact: true }).click();
    await m.getByRole('button', { name: 'Confirmar comanda adicional', exact: true }).click();
    await expect(m).toHaveURL(/\/mesas$/);

    await k.reload();
    await expect(ticket).toHaveCount(2);
    await expect(ticket.filter({ hasText: 'Pollo a la brasa entero' }).getByRole('button', { name: 'Marcar listo' })).toBeVisible();
    await expect(ticket.filter({ hasText: '1/2 Pollo a la brasa' }).getByRole('button', { name: 'Comenzar' })).toBeVisible();

    await m.getByRole('button', { name: /Mesa 04/ }).click();
    await m.getByRole('button', { name: 'Solicitar cuenta para caja', exact: true }).click();
    await c.goto('/caja');
    await expect(c.getByRole('tab', { name: /Por cobrar\s*1/ })).toBeVisible();
    await c.getByLabel('Monto recibido').fill('200');
    await c.getByRole('button', { name: /^Cobrar S\// }).click();
    const recibo = c.getByRole('dialog');
    await expect(recibo).toContainText('Pollo a la brasa entero');
    await expect(recibo).toContainText('1/2 Pollo a la brasa');
    await c.getByRole('button', { name: 'Cerrar comprobante', exact: true }).click();
    await expect(c.getByRole('tab', { name: /Por cobrar\s*0/ })).toBeVisible();
  } finally {
    await Promise.all([m.close(), k.close(), c.close()]);
  }
});
