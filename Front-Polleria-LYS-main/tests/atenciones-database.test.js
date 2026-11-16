import { beforeAll, afterAll, expect, test } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createLocalDatabase,asLocalUser,localUsers } from '../scripts/local-db.mjs';
let db;
const user=rol=>localUsers.find(user=>user.rol===rol);
const query=(rol,sql,args=[])=>asLocalUser(db,user(rol),tx=>tx.query(sql,args));
const list=async rol=>(await query(rol,'SELECT public.flujo_listar() AS data')).rows[0].data;
const run=async(rol,accion,data)=> {
 const atencion=['cerrar','adicional'].includes(accion)?(await list(rol)).atenciones.find(a=>a.mesa_id===data.mesa)?.id:undefined;
 return (await query(rol,'SELECT public.flujo_operar($1,$2) AS data',[accion,{operacion:randomUUID(),atencion,...(accion==='cerrar'?{confirmar_salida:true}:{}),...data}])).rows[0].data;
};
const account=async id=>(await list('admin')).cuentas.find(p=>p.id===id);
const act=async(rol,accion,id,data={})=>run(rol,accion,{pedido:id,version:(await account(id)).version_cuenta,...data});
const open=async(mesa=1,accion='abrir')=>(await run('mesera',accion,{mesa,items:[{id:1,qty:1}]})).pedido;
const ready=async id=>{await act('cocina','comenzar',id);await act('cocina','listo',id);};
const pay=async id=>act('caja','cobrar',id,{metodo:'efectivo',recibido:(await account(id)).total,anticipado:true});
beforeAll(async()=>{db=await createLocalDatabase();},60000);
afterAll(async()=>{await db?.close();});

test('el cobro anticipado no entrega platos, liberar exige entrega y cierre explícito',async()=>{
 const id=await open();await pay(id);
 await expect(run('mesera','cerrar',{mesa:1})).rejects.toThrow(/Faltan/);
 await ready(id);await act('cocina','entregar',id);
 expect((await list('mesera')).mesas.find(m=>m.id===1).estado).toBe('ocupada');
 await run('mesera','cerrar',{mesa:1});
 expect((await list('mesera')).mesas.find(m=>m.id===1).estado).toBe('libre');
});
test('cuentas adicionales de una atención conservan los cobros y el trabajo previo',async()=>{
 const first=await open(2);await pay(first);
 const second=await open(2,'adicional');
 expect((await account(first)).atencion_id).toBe((await account(second)).atencion_id);
 await expect(open(2,'adicional')).rejects.toThrow(/cuenta abierta/);
 await pay(second);await ready(first);await act('cocina','entregar',first);
 await expect(run('mesera','cerrar',{mesa:2})).rejects.toThrow(/Faltan/);
 await ready(second);await act('cocina','entregar',second);await run('mesera','cerrar',{mesa:2});
});
test('solicitar bloquea edición, reabrir invalida cobro viejo incluso con el mismo importe',async()=>{
 const id=await open(3);await act('mesera','solicitar',id);const old=await account(id);
 await expect(act('mesera','editar',id,{items:[{id:1,qty:2}]})).rejects.toThrow(/Reabre/);
 await act('mesera','reabrir',id);await act('mesera','editar',id,{items:[{id:1,qty:1}],notas:'Sin ají'});
 await expect(run('caja','cobrar',{pedido:id,version:old.version_cuenta,metodo:'efectivo',recibido:old.total})).rejects.toThrow(/cuenta cambió/);
 await expect(act('caja','cobrar',id,{metodo:'efectivo',recibido:old.total})).rejects.toThrow(/anticipado/);
});
test('la mesera anula antes de preparar; después se requiere administración y confirmación de cocina',async()=>{
 const early=await open(4);await act('mesera','incidencia',early,{motivo:'Comanda duplicada'});
 expect((await account(early)).estado).toBe('cancelado');await run('mesera','cerrar',{mesa:4});
 const late=await open(5);await act('cocina','comenzar',late);await act('caja','incidencia',late,{motivo:'Cliente solicita cancelar'});
 await expect(act('cocina','listo',late)).rejects.toThrow(/incidencia/);
 await expect(act('mesera','autorizar',late)).rejects.toThrow(/rol/);
 await act('admin','autorizar',late);await act('cocina','detener',late);
 expect((await account(late)).estado).toBe('cancelado');
});
test('un consumo entregado se conserva cuando administración autoriza la pérdida',async()=>{
 const id=await open(6);await ready(id);await act('cocina','entregar',id);
 await act('mesera','incidencia',id,{motivo:'Cliente se retiró sin pagar'});await act('admin','autorizar',id);
 const p=await account(id);expect(p.entregas).toHaveLength(1);expect(p.estado).toBe('cancelado');
 expect(p.incidencias[0]).toMatchObject({tipo:'consumo_no_cobrado',estado:'resuelta'});
});
test('una devolución conserva el pago, exige autorización y referencia de devolución real',async()=>{
 const id=await open(7);await ready(id);await act('cocina','entregar',id);await pay(id);
 const original=(await account(id)).pago;
 await act('caja','incidencia',id,{motivo:'Devolución autorizada por reclamo'});
 await expect(act('caja','devolver',id,{importe:original.monto,referencia:'DEV-001'})).rejects.toThrow(/autorizada/);
 await act('admin','autorizar',id);await act('caja','devolver',id,{importe:original.monto,referencia:'DEV-001'});
 expect((await account(id)).pago).toEqual(original);
});
test('reintentar la misma operación no crea otra cuenta ni otro pago',async()=>{
 const data={operacion:randomUUID(),mesa:8,items:[{id:1,qty:1}]};
 const first=await run('mesera','abrir',data);expect(await run('mesera','abrir',data)).toEqual(first);
 const p=await account(first.pedido);const payment={operacion:randomUUID(),pedido:p.id,version:p.version_cuenta,metodo:'efectivo',recibido:p.total,anticipado:true};
 expect(await run('caja','cobrar',payment)).toEqual(await run('caja','cobrar',payment));
});
test('no permite escrituras directas, roles falsificados ni invocar implementaciones internas',async()=>{
 for(const rol of ['cliente','cocina']) await expect(run(rol,'abrir',{mesa:9,rol:'admin'})).rejects.toThrow(/rol|personal/);
 await expect(list('cliente')).rejects.toThrow(/personal/);
 await expect(query('mesera',"UPDATE mesas SET estado='libre' WHERE id=3")).rejects.toThrow(/permission denied/);
 await expect(query('admin','SELECT public.cancelar_cuenta_atencion($1)',[randomUUID()])).rejects.toThrow(/permission denied/);
 await expect(query('admin','DELETE FROM public.operaciones_atencion')).rejects.toThrow(/permission denied/);
});
test('perfil, catálogo y pedidos privados del cliente conservan sus permisos con la migración nueva',async()=>{
 expect((await query('cliente','SELECT * FROM productos WHERE disponible')).rows.length).toBeGreaterThan(0);
 expect((await query('cliente','SELECT id FROM perfiles')).rows.map(p=>p.id)).toEqual([user('cliente').id]);
 await expect(query('cliente',"UPDATE perfiles SET rol='admin' WHERE id=auth.uid()")).rejects.toThrow(/permission denied/);
 expect((await query('cliente','SELECT * FROM pedidos')).rows).toEqual([]);
 const id=randomUUID();await query('cliente','SELECT crear_pedido_cliente($1,$2,$3,$4,$5)',[id,'recojo',[{id:1,qty:1}],{name:'Cliente local',phone:'987654321'},'efectivo']);
 expect((await query('cliente','SELECT id FROM pedidos')).rows.map(p=>p.id)).toEqual([id]);
});
test('conserva nombres y precios vendidos aunque cambie el catálogo',async()=>{
 const id=await open(9),before=await account(id);
 await db.query("UPDATE productos SET precio=precio+1,nombre=nombre||' actualizado' WHERE id=1");
 await act('mesera','editar',id,{items:[{id:1,qty:2}],notas:'Más platos'});
 const after=await account(id);
 expect(after.items[0].precio_unitario).toBe(before.items[0].precio_unitario);
 expect(after.items[0].nombre_producto).toBe(before.items[0].nombre_producto);
 await db.query('UPDATE productos SET precio=$1,nombre=$2 WHERE id=1',[before.items[0].precio_unitario,before.items[0].nombre_producto]);
});
test('una ampliación solo devuelve a cocina cantidades nuevas y no permite retirar lo entregado',async()=>{
 const id=await open(10);await ready(id);await act('cocina','entregar',id);
 await act('mesera','editar',id,{items:[{id:1,qty:3}]});await ready(id);await act('cocina','entregar',id);
 const p=await account(id);expect(p.entregas.map(e=>e.items[0].cantidad)).toEqual([1,2]);
 await expect(act('mesera','editar',id,{items:[{id:1,qty:2}]})).rejects.toThrow(/retirar|entregados/);
});
test('devolución anticipada puede detener cocina sin cobrar ni entregar platos ficticios',async()=>{
 const id=await open(11);await pay(id);await act('caja','incidencia',id,{motivo:'Reclamo después del pago anticipado'});await act('admin','autorizar',id);
 await expect(act('caja','devolver',id,{importe:(await account(id)).total,referencia:'DEV-002'})).rejects.toThrow(/cocina/);
 await act('cocina','detener',id);const p=await account(id);await act('caja','devolver',id,{importe:p.total,referencia:'DEV-002'});
 const after=await account(id);expect(after.estado).toBe('cancelado');expect(after.entregas).toEqual([]);expect(after.pago).toEqual(p.pago);
 await run('mesera','cerrar',{mesa:11});
 const summary=(await query('admin','SELECT flujo_devoluciones() AS data')).rows[0].data;
 expect(Number(summary.total)).toBeGreaterThan(0);
 await expect(query('caja','SELECT flujo_devoluciones()')).rejects.toThrow(/administración/);
});
test('rechazar una cancelación devuelve el control a cocina y no altera pagos',async()=>{
 const id=await open(12);await act('cocina','comenzar',id);await act('mesera','incidencia',id,{motivo:'Cancelación ingresada por error'});await act('admin','rechazar',id);await act('cocina','listo',id);
 expect((await account(id)).estado).toBe('listo');
});
test('dos aperturas concurrentes no duplican atención y no permiten liberar desde una pestaña vieja',async()=>{
 const results=await Promise.allSettled([open(13),open(13)]);
 expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
 await expect(run('mesera','cerrar',{mesa:13,confirmar_salida:false})).rejects.toThrow(/clientes/);
});
test('las RPC anteriores no evitan la versión ni permiten cobros de salón',async()=>{
 const id=await open(14),p=await account(id);
 await expect(query('caja','SELECT registrar_cobro($1,$2,$3,$4,$5,$6)',[id,'efectivo',p.total,randomUUID(),p.total,null])).rejects.toThrow(/flujo/);
 await expect(query('mesera','SELECT anular_comanda_salon($1,$2)',[14,'Motivo de prueba'])).rejects.toThrow(/permission denied/);
 await expect(query('cocina','SELECT entregar_cocina_base_atenciones($1,$2)',[id,p.actualizado_en])).rejects.toThrow(/permission denied/);
});
test('reservar y cancelar reserva no toca ninguna cuenta; una atención ocupada no se puede reservar',async()=>{
 await run('mesera','reservar',{mesa:15,cliente:'Familia prueba',hora:'20:00',telefono:'987654321',comensales:3});
 expect((await list('mesera')).mesas.find(m=>m.id===15).estado).toBe('reservada');
 await run('mesera','cancelar_reserva',{mesa:15});expect((await list('mesera')).mesas.find(m=>m.id===15).estado).toBe('libre');
 await expect(run('mesera','reservar',{mesa:14,cliente:'Prueba',hora:'20:00'})).rejects.toThrow(/atención/);
});
test('no admite importes manipulados, pagos insuficientes ni quitar productos de pedidos cobrados',async()=>{
 const id=await open(16),p=await account(id);
 await expect(act('caja','cobrar',id,{anticipado:true,metodo:'efectivo',recibido:1,total:1})).rejects.toThrow(/monto/);
 await expect(act('caja','cobrar',id,{anticipado:true,metodo:'yape',recibido:Number(p.total)+1})).rejects.toThrow(/monto/);
 await pay(id);await expect(act('mesera','editar',id,{items:[{id:1,qty:2}]})).rejects.toThrow(/cobrado/);
});
test('la migración conserva importes y registros históricos y vincula una atención existente',async()=>{
 let before,existing;
 const migrationDb=await createLocalDatabase(undefined,{beforePreview:async raw=>{
  const who=localUsers.find(u=>u.rol==='mesera');existing=randomUUID();
  await asLocalUser(raw,who,tx=>tx.query('SELECT abrir_pedido_salon($1,1,2,$2,$3)',[existing,'Atención existente',JSON.stringify([{id:1,qty:1}])]));
  before=(await raw.query('SELECT total,subtotal,estado,estado_pago FROM pedidos WHERE id=$1',[existing])).rows[0];
 }});
 try{const after=(await migrationDb.query('SELECT total,subtotal,estado,estado_pago,atencion_id FROM pedidos WHERE id=$1',[existing])).rows[0];expect(after).toMatchObject(before);expect(after.atencion_id).toBeTruthy();expect((await migrationDb.query('SELECT count(*) AS n FROM pagos')).rows[0].n).toBe(0);}finally{await migrationDb.close();}
});
test('una pestaña de una atención anterior no cierra ni añade cuentas a nuevos clientes de la misma mesa',async()=>{
 const first=await open(1);const oldAttention=(await account(first)).atencion_id;await ready(first);await pay(first);await act('cocina','entregar',first);await run('mesera','cerrar',{mesa:1});
 const next=await open(1);await ready(next);await pay(next);await act('cocina','entregar',next);
 await expect(run('mesera','cerrar',{mesa:1,atencion:oldAttention})).rejects.toThrow(/atención.*cambió/);
 await expect(run('mesera','adicional',{mesa:1,atencion:oldAttention,items:[{id:1,qty:1}]})).rejects.toThrow(/atención.*cambió/);
 expect((await list('mesera')).mesas.find(m=>m.id===1).estado).toBe('ocupada');await run('mesera','cerrar',{mesa:1});
});
