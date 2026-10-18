import { beforeEach, afterEach, expect, test, vi } from 'vitest';
const fake=vi.hoisted(()=>({realtime:{connect:vi.fn(),subscribe:vi.fn(),unsubscribe:vi.fn(),disconnect:vi.fn(),on:vi.fn(),off:vi.fn()},query:{},user:vi.fn(),from:vi.fn()}));
vi.mock('../src/lib/insforge',()=>({requireInsforge:()=>({realtime:fake.realtime,database:{from:fake.from}})}));
vi.mock('../src/services/authService',()=>({getCurrentUser:fake.user}));
import {watchOrders,getOrderChangeStamp,ORDER_EVENT} from '../src/services/orderUpdates';
const cleanup=[];let stamp='2026-10-16T12:00:00Z';
const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
function watch(fn){const stop=watchOrders(fn,{intervalMs:5000});cleanup.push(stop);return stop;}
beforeEach(()=>{
 vi.useFakeTimers();vi.clearAllMocks();stamp='2026-10-16T12:00:00Z';fake.user.mockReturnValue({id:'cliente-id',rol:'cliente'});
 fake.realtime.connect.mockResolvedValue();fake.realtime.subscribe.mockResolvedValue({ok:true});fake.from.mockReturnValue(fake.query);
 for(const name of ['select','order','limit','eq'])fake.query[name]=vi.fn(()=>fake.query);
 fake.query.then=resolve=>resolve({data:[{actualizado_en:stamp}],count:1,error:null});
 vi.stubGlobal('window',new EventTarget());vi.stubGlobal('document',Object.assign(new EventTarget(),{visibilityState:'visible'}));
});
afterEach(()=>{cleanup.splice(0).forEach(fn=>fn());vi.useRealTimers();vi.unstubAllGlobals();});
test('comparte canal y sonda entre componentes y desconecta al salir del último',async()=>{
 const a=vi.fn(),b=vi.fn(),stopA=watch(a),stopB=watch(b);await flush();
 expect(fake.realtime.subscribe).toHaveBeenCalledTimes(1);expect(fake.realtime.subscribe).toHaveBeenCalledWith('lys:client:cliente-id');
 fake.from.mockClear();await vi.advanceTimersByTimeAsync(5000);expect(fake.from).toHaveBeenCalledTimes(1);
 stopA();expect(fake.realtime.unsubscribe).not.toHaveBeenCalled();stopB();expect(fake.realtime.unsubscribe).toHaveBeenCalledWith('lys:client:cliente-id');
});
test('descarta eventos de otros canales o enviados por usuarios',async()=>{
 const fn=vi.fn();watch(fn);await flush();fn.mockClear();
 const listener=fake.realtime.on.mock.calls.find(([name])=>name===ORDER_EVENT)[1];
 listener({meta:{channel:'lys:client:otro',senderType:'system'}});listener({meta:{channel:'lys:client:cliente-id',senderType:'user'}});expect(fn).not.toHaveBeenCalled();
 listener({meta:{channel:'lys:client:cliente-id',senderType:'system'}});expect(fn).toHaveBeenCalledTimes(1);
});
test('no descarga pedidos completos cuando la sonda no cambia',async()=>{
 const fn=vi.fn();watch(fn);await flush();fn.mockClear();
 await vi.advanceTimersByTimeAsync(15000);expect(fn).not.toHaveBeenCalled();
 stamp='2026-10-16T12:01:00Z';await vi.advanceTimersByTimeAsync(5000);expect(fn).toHaveBeenCalledTimes(1);
 expect(fake.query.select).toHaveBeenCalledWith('actualizado_en',{count:'exact'});expect(fake.query.limit).toHaveBeenCalledWith(1);expect(fake.query.eq).toHaveBeenCalledWith('cliente_id','cliente-id');
});
test('pausa la sonda oculta y recupera datos al volver, reconectar o recuperar red',async()=>{
 const fn=vi.fn();watch(fn);await flush();fn.mockClear();fake.from.mockClear();
 document.visibilityState='hidden';await vi.advanceTimersByTimeAsync(10000);expect(fake.from).not.toHaveBeenCalled();
 document.visibilityState='visible';document.dispatchEvent(new Event('visibilitychange'));window.dispatchEvent(new Event('online'));fake.realtime.on.mock.calls.find(([name])=>name==='connect')[1]();expect(fn).toHaveBeenCalledTimes(3);
});
test('recupera cambios sin WebSocket mediante la sonda',async()=>{
 fake.realtime.connect.mockRejectedValue(new Error('offline'));const fn=vi.fn();watch(fn);await flush();fn.mockClear();stamp='nuevo';await vi.advanceTimersByTimeAsync(5000);expect(fn).toHaveBeenCalled();
});
test('limpia el registro cuando se desmonta durante connect',async()=>{
 let resolve;fake.realtime.connect.mockReturnValue(new Promise(done=>{resolve=done;}));const fn=vi.fn();const stop=watch(fn);stop();resolve();await flush();expect(fake.realtime.subscribe).not.toHaveBeenCalled();expect(fn).not.toHaveBeenCalled();
});
test('propaga el error de la sonda al consumidor y exige sesión',async()=>{
 fake.query.then=resolve=>resolve({error:{message:'Sin conexión'}});await expect(getOrderChangeStamp()).rejects.toThrow(/Sin conexión/);
 fake.user.mockReturnValue(null);await expect(getOrderChangeStamp()).rejects.toThrow(/iniciar sesión/);
});

test('un panel con sondeo propio puede recibir eventos sin duplicar la carga ni la sonda',async()=>{
 fake.realtime.connect.mockRejectedValue(new Error('offline'));const fn=vi.fn();
 const stop=watchOrders(fn,{initialRefresh:false,poll:false});cleanup.push(stop);await flush();
 await vi.advanceTimersByTimeAsync(15000);expect(fn).not.toHaveBeenCalled();expect(fake.from).not.toHaveBeenCalled();
 fake.realtime.on.mock.calls.find(([name])=>name===ORDER_EVENT)[1]({meta:{channel:'lys:client:cliente-id',senderType:'system'}});
 expect(fn).toHaveBeenCalledTimes(1);
});
