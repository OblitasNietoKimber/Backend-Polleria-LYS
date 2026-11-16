import { beforeEach, afterEach, expect, test, vi } from 'vitest';
const fake=vi.hoisted(()=>({query:{},rpc:vi.fn(),user:vi.fn(),from:vi.fn()}));
vi.mock('../src/lib/insforge',()=>({requireInsforge:()=>({database:{from:fake.from,rpc:fake.rpc}})}));
vi.mock('../src/services/authService',()=>({getCurrentUser:fake.user}));
import cocina,{mapPedido} from '../src/services/cocinaService';
const row={id:'60000000-0000-0000-0000-000000000091',tipo:'recojo',estado:'listo',estado_pago:'pendiente',notas:'Sin ají',creado_en:'2026-10-16T10:00:00Z',mesas:null,detalles_pedido:[{id:'detalle',producto_id:1,cantidad:2,nombre_producto:'Nombre vendido'}],historial_estados_pedido:[{id:1,estado:'pendiente',cambiado_en:'2026-10-16T10:00:00Z'},{id:2,estado:'listo',cambiado_por:'cocinero',cambiado_en:'2026-10-16T11:00:00Z'}]};
beforeEach(()=>{
 vi.clearAllMocks();fake.user.mockReturnValue({id:'cocinero',rol:'cocina'});fake.from.mockReturnValue(fake.query);
 for(const method of ['select','in','is','order'])fake.query[method]=vi.fn(()=>fake.query);
 fake.query.range=vi.fn().mockResolvedValue({data:[row],error:null});fake.rpc.mockResolvedValue({data:row.id,error:null});
});
afterEach(()=>vi.unstubAllGlobals());
test('un backend sin migracion de entregas conserva la preparacion sin simular entregas',async()=>{
 fake.query.range.mockResolvedValueOnce({error:{code:'PGRST200',message:"Could not find a relationship between 'pedidos' and 'entregas_cocina' in the schema cache"}});
 const pedidos=await cocina.getPedidosActivos();
 expect(pedidos).toHaveLength(1);expect(pedidos[0].entregaDisponible).toBe(false);
 expect(fake.query.select.mock.calls[1][0]).not.toMatch(/entregas_cocina|cocina_entregado_en/);
 await expect(cocina.cambiarEstado(pedidos[0],'entregado')).rejects.toThrow(/no está habilitada/);
 expect(fake.rpc).not.toHaveBeenCalled();
 await cocina.cambiarEstado({...pedidos[0],estadoCocina:'nuevo'},'en_preparacion');
 expect(fake.rpc).toHaveBeenCalledWith('cambiar_estado_cocina',expect.objectContaining({p_nuevo_estado:'en_preparacion'}));
});
test('el historial anterior sigue disponible sin inventar entregas fisicas',async()=>{
 fake.rpc.mockResolvedValueOnce({error:{code:'PGRST202',message:'Could not find the function public.obtener_historial_entregas_cocina in the schema cache'}});
 const pedidos=await cocina.getPedidosFinalizados({page:1});
 expect(pedidos[0]).toMatchObject({esAnterior:true,entregaDisponible:false});
 expect(pedidos[0].entregadoEn).toBeUndefined();
 expect(fake.query.in).toHaveBeenCalledWith('estado',['entregado']);
 expect(fake.query.range).toHaveBeenCalledWith(50,99);
});
test('los errores de permisos no activan la compatibilidad ni ocultan el problema',async()=>{
 fake.query.range.mockResolvedValueOnce({error:{code:'42501',message:'permission denied for table entregas_cocina'}});
 await expect(cocina.getPedidosActivos()).rejects.toThrow(/permission denied/);
 expect(fake.query.range).toHaveBeenCalledTimes(1);
});
test('consulta los nombres vendidos, notas y responsable del cambio del servidor',async()=>{
 vi.stubGlobal('localStorage',{getItem:()=>{throw new Error('No debe leer pedidos locales');}});
 expect(await cocina.getPedidosActivos()).toEqual([expect.objectContaining({id:row.id,observaciones:'Sin ají',cambiadoPor:'cocinero',estadoCocina:'listo',items:[{id:'detalle',productoId:1,nombre:'Nombre vendido',cantidad:2}]})]);
 expect(fake.query.in).toHaveBeenCalledWith('estado',['pendiente','en_preparacion','listo']);
});
test('continúa la lectura después de cien pedidos sin ocultar comandas',async()=>{
 fake.query.range.mockResolvedValueOnce({data:Array.from({length:100},()=>row),error:null});
 expect(await cocina.getPedidosActivos()).toHaveLength(101);expect(fake.query.range).toHaveBeenLastCalledWith(100,199);
});
test('no muestra comandas vacías ni inventa la fecha histórica de preparación',async()=>{
 fake.query.range.mockResolvedValueOnce({data:[{...row,detalles_pedido:[]}],error:null});expect(await cocina.getPedidosActivos()).toEqual([]);
 expect(mapPedido({...row,historial_estados_pedido:[{id:1,estado:'listo',es_reconstruido:true}]}).finalizadoAt).toBeNull();
});
test('envía UUID y estado esperado sin permitir precios ni cobros desde cocina',async()=>{
 await cocina.cambiarEstado({id:row.id,estadoCocina:'nuevo'},'en_preparacion');
 expect(fake.rpc).toHaveBeenCalledWith('cambiar_estado_cocina',{p_pedido_id:row.id,p_estado_actual:'pendiente',p_nuevo_estado:'en_preparacion'});
 expect(fake.from).not.toHaveBeenCalled();
});
test('propaga el conflicto de concurrencia y los errores de lectura',async()=>{
 fake.rpc.mockResolvedValue({error:{message:'Otro usuario cambió el pedido'}});await expect(cocina.cambiarEstado({id:row.id,estadoCocina:'nuevo'},'en_preparacion')).rejects.toThrow(/Otro usuario/);
 fake.query.range.mockResolvedValue({error:{message:'Sin conexión'}});await expect(cocina.getPedidosActivos()).rejects.toThrow(/Sin conexión/);
});
test('pagina el historial de entregas y rechaza páginas inválidas',async()=>{
 fake.rpc.mockResolvedValueOnce({data:[row],error:null});
 expect(await cocina.getPedidosFinalizados({page:2})).toHaveLength(1);
 expect(fake.rpc).toHaveBeenCalledWith('obtener_historial_entregas_cocina',{p_limite:50,p_offset:100});
 await expect(cocina.getPedidosFinalizados({page:-1})).rejects.toThrow(/Página/);
});
test.each(['cliente','mesera','caja',null])('el rol %s no consulta ni modifica cocina',async rol=>{
 fake.user.mockReturnValue(rol?{rol}:null);await expect(cocina.getPedidosActivos()).rejects.toThrow(/cocina/);await expect(cocina.cambiarEstado({id:row.id},'listo')).rejects.toThrow(/cocina/);
});

test('oculta bebidas y postres en pedidos mixtos y omite los de solo servicio directo',async()=>{
 const bebida={id:'bebida',producto_id:14,nombre_producto:'Agua',cantidad:1,requiere_preparacion:false};
 fake.query.range.mockResolvedValueOnce({data:[{...row,detalles_pedido:[...row.detalles_pedido,bebida]},{...row,id:'solo-bebida',detalles_pedido:[bebida]}],error:null});
 const result=await cocina.getPedidosActivos();
 expect(result).toHaveLength(1);expect(result[0].items).toHaveLength(1);expect(result[0].items[0].nombre).toBe('Nombre vendido');
});
test('muestra únicamente las cantidades pendientes después de una entrega',async()=>{
 const result=mapPedido({...row,entregas_cocina:[{items:[{producto_id:1,cantidad:1}]}]});
 expect(result.items[0].cantidad).toBe(1);
 expect(mapPedido({...row,entregas_cocina:[{items:[{producto_id:1,cantidad:2}]}]}).items).toEqual([]);
});
test('entrega con la versión del servidor y filtra tarjetas ya retiradas',async()=>{
 await cocina.cambiarEstado({...mapPedido(row),actualizadoEn:'2026-11-15T12:00:00.123456Z'},'entregado');
 expect(fake.rpc).toHaveBeenCalledWith('entregar_pedido_cocina',{p_pedido_id:row.id,p_actualizado_en:'2026-11-15T12:00:00.123456Z'});
 await cocina.getPedidosActivos();expect(fake.query.is).toHaveBeenCalledWith('cocina_entregado_en',null);
});
