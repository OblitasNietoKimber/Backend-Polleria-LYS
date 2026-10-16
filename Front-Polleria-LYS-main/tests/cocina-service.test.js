import { beforeEach, afterEach, expect, test, vi } from 'vitest';
const fake=vi.hoisted(()=>({query:{},rpc:vi.fn(),user:vi.fn(),from:vi.fn()}));
vi.mock('../src/lib/insforge',()=>({requireInsforge:()=>({database:{from:fake.from,rpc:fake.rpc}})}));
vi.mock('../src/services/authService',()=>({getCurrentUser:fake.user}));
import cocina,{mapPedido} from '../src/services/cocinaService';
const row={id:'60000000-0000-0000-0000-000000000091',tipo:'recojo',estado:'listo',estado_pago:'pendiente',notas:'Sin ají',creado_en:'2026-10-16T10:00:00Z',mesas:null,detalles_pedido:[{id:'detalle',producto_id:1,cantidad:2,nombre_producto:'Nombre vendido'}],historial_estados_pedido:[{id:1,estado:'pendiente',cambiado_en:'2026-10-16T10:00:00Z'},{id:2,estado:'listo',cambiado_por:'cocinero',cambiado_en:'2026-10-16T11:00:00Z'}]};
beforeEach(()=>{
 vi.clearAllMocks();fake.user.mockReturnValue({id:'cocinero',rol:'cocina'});fake.from.mockReturnValue(fake.query);
 for(const method of ['select','in','order'])fake.query[method]=vi.fn(()=>fake.query);
 fake.query.range=vi.fn().mockResolvedValue({data:[row],error:null});fake.rpc.mockResolvedValue({data:row.id,error:null});
});
afterEach(()=>vi.unstubAllGlobals());
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
test('pagina el historial de listos y entregados y rechaza páginas inválidas',async()=>{
 await cocina.getPedidosFinalizados({page:2});expect(fake.query.in).toHaveBeenCalledWith('estado',['listo','entregado']);expect(fake.query.range).toHaveBeenCalledWith(100,149);
 await expect(cocina.getPedidosFinalizados({page:-1})).rejects.toThrow(/Página/);
});
test.each(['cliente','mesera','caja',null])('el rol %s no consulta ni modifica cocina',async rol=>{
 fake.user.mockReturnValue(rol?{rol}:null);await expect(cocina.getPedidosActivos()).rejects.toThrow(/cocina/);await expect(cocina.cambiarEstado({id:row.id},'listo')).rejects.toThrow(/cocina/);
});
