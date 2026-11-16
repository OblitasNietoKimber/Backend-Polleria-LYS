import {beforeAll,beforeEach,afterAll,test,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createLocalDatabase,asLocalUser,localUsers} from '../scripts/local-db.mjs';
let db,mesa=0;
const query=(rol,sql,args=[])=>asLocalUser(db,localUsers.find(u=>u.rol===rol),tx=>tx.query(sql,args));
const stock=async id=>(await query(null,'SELECT * FROM public.productos_catalogo WHERE id=$1',[id])).rows[0];
const list=async()=> (await query('admin','SELECT public.flujo_listar() AS data')).rows[0].data;
const act=async(rol,action,id,extra={})=>{
 const p=(await list()).cuentas.find(p=>p.id===id);
 return (await query(rol,'SELECT public.flujo_operar($1,$2) AS data',[action,{operacion:randomUUID(),...(id?{pedido:id,version:p?.version_cuenta}:{}),...extra}])).rows[0].data;
};
const open=async(items)=>(await act('mesera','abrir',null,{mesa:++mesa,items})).pedido;
const client=async(tipo,items,id=randomUUID())=>(await query('cliente','SELECT public.crear_pedido_cliente($1,$2,$3,$4,$5) AS id',
 [id,tipo,items,{name:'Cliente Prueba',phone:'999999999',address:'Av. Prueba 123'},'tarjeta'])).rows[0].id;
const adjust=async(rol,id,amount,op=randomUUID())=>query(rol,'SELECT public.ajustar_inventario($1,$2,$3,$4)',[id,amount,'Conteo de prueba',op]);
beforeAll(async()=>{db=await createLocalDatabase(undefined,{inventory:true});},60000);
beforeEach(async()=>{await db.exec("UPDATE public.inventario_recursos SET unidades=CASE WHEN escala=8 THEN 1600 ELSE 100 END");});
afterAll(async()=>{await db?.close();});

test('entero, medio y cuarto comparten el mismo saldo y los canales descuentan al confirmar',async()=>{
 await client('delivery',[{id:1,qty:1}]);await client('recojo',[{id:2,qty:1}]);await open([{id:3,qty:1}]);
 expect(Number((await stock(1)).stock)).toBe(198);expect(Number((await stock(2)).stock)).toBe(396);
 expect(Number((await stock(3)).stock)).toBe(793);
});
test('reintentar la creación no descuenta dos veces',async()=>{
 const id=randomUUID();await client('delivery',[{id:1,qty:2}],id);await client('delivery',[{id:1,qty:2}],id);
 expect(Number((await stock(1)).stock)).toBe(198);
});
test('una comanda mezcla fracciones y rechaza sobreventa con rollback completo',async()=>{
 await db.exec("UPDATE public.inventario_recursos SET unidades=8 WHERE id='pollo-brasa'");
 const before=Number((await db.query('SELECT count(*) FROM public.pedidos')).rows[0].count);
 await expect(client('delivery',[{id:1,qty:1},{id:3,qty:1}])).rejects.toThrow(/Stock insuficiente/);
 expect(Number((await stock(1)).stock)).toBe(1);
 expect(Number((await db.query('SELECT count(*) FROM public.pedidos')).rows[0].count)).toBe(before);
});
test('dos compradores de la última unidad solo confirman una compra',async()=>{
 await db.exec("UPDATE public.inventario_recursos SET unidades=8 WHERE id='pollo-brasa'");
 const results=await Promise.allSettled([client('delivery',[{id:1,qty:1}]),client('recojo',[{id:1,qty:1}])]);
 expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(Number((await stock(1)).stock)).toBe(0);
});
test('editar antes de preparar reserva solo la diferencia y devuelve lo retirado',async()=>{
 const id=await open([{id:1,qty:2}]);await act('mesera','editar',id,{items:[{id:1,qty:3}]});
 expect(Number((await stock(1)).stock)).toBe(197);
 await act('mesera','editar',id,{items:[{id:1,qty:1}]});expect(Number((await stock(1)).stock)).toBe(199);
});
test('anular sin preparar repone exactamente una vez',async()=>{
 const id=await open([{id:1,qty:2}]);await act('mesera','incidencia',id,{motivo:'Cliente cancela antes de preparar'});
 expect(Number((await stock(1)).stock)).toBe(200);
 await expect(act('mesera','incidencia',id,{motivo:'Reintento de anulación'})).rejects.toThrow();
 expect(Number((await stock(1)).stock)).toBe(200);
});
test('anular después de preparar no devuelve alimento consumido',async()=>{
 const id=await open([{id:1,qty:1}]);await act('cocina','comenzar',id);
 await act('mesera','incidencia',id,{motivo:'Cliente cancela después de preparar'});
 await act('admin','autorizar',id);await act('cocina','detener',id);
 expect(Number((await stock(1)).stock)).toBe(199);
});
test('pagar y entregar no vuelve a descontar; ampliar después de entregar descuenta la diferencia',async()=>{
 const id=await open([{id:1,qty:1}]);await act('cocina','comenzar',id);await act('cocina','listo',id);await act('cocina','entregar',id);
 await act('mesera','editar',id,{items:[{id:1,qty:2}]});expect(Number((await stock(1)).stock)).toBe(198);
 const p=(await list()).cuentas.find(p=>p.id===id);
 await act('caja','cobrar',id,{metodo:'efectivo',recibido:p.total,anticipado:true});expect(Number((await stock(1)).stock)).toBe(198);
});
test('solo admin repone, sus reintentos son idempotentes y ningún saldo queda negativo',async()=>{
 await expect(adjust('cliente',1,10)).rejects.toThrow(/administración/);
 await expect(query('mesera',"UPDATE public.inventario_recursos SET unidades=999999 WHERE id='pollo-brasa'")).rejects.toThrow(/permission denied/);
 const op=randomUUID();await adjust('admin',1,1.5,op);await adjust('admin',1,1.5,op);
 expect(Number((await stock(1)).inventario_disponible)).toBe(201.5);
 await expect(adjust('admin',1,1,op)).rejects.toThrow(/otro ajuste/);
 await expect(adjust('admin',1,-1000)).rejects.toThrow(/negativo/);
 await expect(adjust('admin',1,0.01)).rejects.toThrow(/unidades/);
});
test('producto nuevo inicia sin existencias inventadas y puede reponerse',async()=>{
 const p=(await query('admin',"INSERT INTO public.productos(categoria_id,nombre,descripcion,precio) VALUES('bebidas','Nueva bebida','Prueba',3) RETURNING id")).rows[0];
 expect(Number((await stock(p.id)).stock)).toBe(0);await adjust('admin',p.id,10);expect(Number((await stock(p.id)).stock)).toBe(10);
});
test('la migración reserva comandas previas activas y conserva sus importes',async()=>{
 const previous=await createLocalDatabase();try{
  const u=localUsers.find(u=>u.rol==='cliente');
  const id=(await asLocalUser(previous,u,tx=>tx.query("SELECT public.crear_pedido_cliente($1,'delivery',$2,$3,'tarjeta') AS id",[randomUUID(),[{id:1,qty:2}],{name:'Cliente Prueba',phone:'999999999',address:'Av. Prueba 123'}]))).rows[0].id;
  const before=(await previous.query('SELECT to_jsonb(p) AS data FROM public.pedidos p WHERE id=$1',[id])).rows[0].data;
  const delivered=(await asLocalUser(previous,u,tx=>tx.query("SELECT public.crear_pedido_cliente($1,'delivery',$2,$3,'efectivo') AS id",[randomUUID(),[{id:1,qty:3}],{name:'Cliente Prueba',phone:'999999999',address:'Av. Prueba 123'}]))).rows[0].id;
  const cook=localUsers.find(u=>u.rol==='cocina');
  for(const action of ['comenzar','listo','entregar']) {
   const current=(await previous.query('SELECT version_cuenta FROM public.pedidos WHERE id=$1',[delivered])).rows[0].version_cuenta;
   await asLocalUser(previous,cook,tx=>tx.query('SELECT public.flujo_operar($1,$2)',[action,{pedido:delivered,version:current,operacion:randomUUID()}]));
  }
  await previous.exec(await readFile(new URL('../../migrations/inventario/20261116020000_inventario-compartido.sql',import.meta.url),'utf8'));
  expect(Number((await previous.query('SELECT stock FROM public.productos_catalogo WHERE id=1')).rows[0].stock)).toBe(198);
  expect((await previous.query('SELECT to_jsonb(p) AS data FROM public.pedidos p WHERE id=$1',[id])).rows[0].data).toEqual(before);
 }finally{await previous.close();}
},60000);

test('la integración de tarjeta registra el pago y descuenta stock una sola vez',async()=>{
 const id=randomUUID(),op=randomUUID();
 const buy=()=>query('cliente','SELECT public.crear_pedido_cliente_tarjeta($1,$2,$3,$4,$5,$6) AS id',
  [id,'delivery',[{id:1,qty:2}],{name:'Cliente Tarjeta',phone:'999999999',address:'Av. Prueba 123'},'pi_stock_'+id,op]);
 await buy();await buy();
 expect(Number((await stock(1)).stock)).toBe(198);
 const p=(await list()).cuentas.find(p=>p.id===id);
 expect(p.estado_pago).toBe('pagado');
 expect(Number((await db.query('SELECT count(*) FROM public.pagos WHERE pedido_id=$1',[id])).rows[0].count)).toBe(1);
});

test('retirar el inventario conserva pedidos y pagos posteriores',async()=>{
 const snapshot="SELECT jsonb_build_object('pedidos',(SELECT jsonb_agg(to_jsonb(p) ORDER BY id) FROM public.pedidos p),'pagos',(SELECT jsonb_agg(to_jsonb(p) ORDER BY id) FROM public.pagos p)) AS data";
 const before=(await db.query(snapshot)).rows[0].data;
 await db.exec(await readFile(new URL('../../docs/revertir-inventario.sql',import.meta.url),'utf8'));
 expect((await db.query(snapshot)).rows[0].data).toEqual(before);
 expect((await db.query("SELECT to_regclass('public.inventario_recursos') AS inventory")).rows[0].inventory).toBeNull();
});
