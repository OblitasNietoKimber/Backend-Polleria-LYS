import { beforeEach, afterEach, expect, test, vi } from 'vitest';

const { realtime, from, user } = vi.hoisted(() => ({
  realtime: { connect: vi.fn(), subscribe: vi.fn(), unsubscribe: vi.fn(), disconnect: vi.fn(), on: vi.fn(), off: vi.fn() },
  from: vi.fn(), user: vi.fn(),
}));
vi.mock('../src/lib/insforge', () => ({ requireInsforge: () => ({ realtime, database: { from } }) }));
vi.mock('../src/services/authService', () => ({ getCurrentUser: user }));

import { CATALOG_EVENT, MESA_EVENT, ORDER_EVENT, liveUpdatesUnavailable, watchCatalog, watchOrders } from '../src/services/orderUpdates';

const cleanup = [];
const clientChannel = 'lys:client:cliente-id';
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
function watch(fn, options) {
  const stop = watchOrders(fn, options);
  cleanup.push(stop);
  return stop;
}
function receive(event, body) {
  realtime.on.mock.calls.filter(([name]) => name === event).forEach(([, handler]) => handler(body));
}
function message(pedidoId, options) {
  return { pedidoId, meta: { channel: clientChannel, senderType: 'system', ...options } };
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  user.mockReturnValue({ id: 'cliente-id', rol: 'cliente' });
  realtime.connect.mockResolvedValue();
  realtime.subscribe.mockResolvedValue({ ok: true });
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('document', Object.assign(new EventTarget(), { visibilityState: 'visible' }));
});
afterEach(() => {
  cleanup.splice(0).forEach(stop => stop());
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

test('comparte canal y no hace sondeo REST cuando está inactivo', async () => {
  const a = vi.fn(), b = vi.fn(), stopA = watch(a), stopB = watch(b);
  await flush();
  expect(realtime.subscribe).toHaveBeenCalledExactlyOnceWith(clientChannel);
  expect(a).toHaveBeenCalledExactlyOnceWith(null);
  expect(b).toHaveBeenCalledExactlyOnceWith(null);
  await vi.advanceTimersByTimeAsync(120000);
  expect(a).toHaveBeenCalledTimes(1);
  expect(from).not.toHaveBeenCalled();
  stopA();
  expect(realtime.unsubscribe).not.toHaveBeenCalled();
  stopB();
  expect(realtime.unsubscribe).toHaveBeenCalledExactlyOnceWith(clientChannel);
});

test('filtra canal, origen y tipo de evento y agrupa cambios del mismo pedido', async () => {
  const fn = vi.fn(), mesa = vi.fn();
  watch(fn);
  watch(mesa, { events: [MESA_EVENT] });
  await flush();
  fn.mockClear();
  mesa.mockClear();
  receive(ORDER_EVENT, message('otro', { channel: 'lys:client:otro' }));
  receive(ORDER_EVENT, message('falso', { senderType: 'user' }));
  receive(ORDER_EVENT, message('pedido-1'));
  receive(ORDER_EVENT, message('pedido-1'));
  receive(MESA_EVENT, message());
  await vi.advanceTimersByTimeAsync(100);
  expect(fn).toHaveBeenCalledExactlyOnceWith([{ event: ORDER_EVENT, pedidoId: 'pedido-1', recurso: undefined, tipo: undefined, inventarioId: undefined, productoId: undefined }]);
  expect(mesa).toHaveBeenCalledTimes(1);
});

test('acumula avisos en segundo plano y resincroniza una vez al reconectar', async () => {
  const fn = vi.fn();
  watch(fn);
  await flush();
  fn.mockClear();
  document.visibilityState = 'hidden';
  receive(ORDER_EVENT, message('pedido-1'));
  await vi.advanceTimersByTimeAsync(60000);
  expect(fn).not.toHaveBeenCalled();
  document.visibilityState = 'visible';
  document.dispatchEvent(new Event('visibilitychange'));
  expect(fn).toHaveBeenCalledTimes(1);
  receive('disconnect');
  expect(liveUpdatesUnavailable()).toBe(true);
  receive('connect');
  await flush();
  expect(liveUpdatesUnavailable()).toBe(false);
  expect(fn).toHaveBeenCalledTimes(2);
  expect(fn).toHaveBeenLastCalledWith(null);
});

test('ofrece carga inicial si falla el WebSocket y se recupera al volver la red', async () => {
  realtime.connect.mockRejectedValueOnce(new Error('offline'));
  const fn = vi.fn();
  watch(fn);
  await vi.advanceTimersByTimeAsync(250);
  expect(liveUpdatesUnavailable()).toBe(true);
  expect(fn).toHaveBeenCalledTimes(1);
  window.dispatchEvent(new Event('online'));
  await flush();
  expect(liveUpdatesUnavailable()).toBe(false);
  expect(fn).toHaveBeenCalledTimes(2);
});

test('permite catálogo anónimo sin compartir su canal con pedidos', async () => {
  user.mockReturnValue(null);
  const fn = vi.fn();
  cleanup.push(watchCatalog(fn));
  await flush();
  expect(realtime.subscribe).toHaveBeenCalledExactlyOnceWith('lys:catalogo');
  receive(CATALOG_EVENT, { recurso: 'stock', meta: { channel: 'lys:catalogo', senderType: 'system' } });
  await vi.advanceTimersByTimeAsync(100);
  expect(fn).toHaveBeenLastCalledWith([{ event: CATALOG_EVENT, recurso: 'stock', pedidoId: undefined, tipo: undefined, inventarioId: undefined, productoId: undefined }]);
});

test('descarta la conexión si el consumidor ya se desmontó', async () => {
  let resolve;
  realtime.connect.mockReturnValueOnce(new Promise(done => { resolve = done; }));
  const fn = vi.fn();
  const stop = watch(fn);
  stop();
  resolve();
  await flush();
  expect(realtime.subscribe).not.toHaveBeenCalled();
  expect(fn).not.toHaveBeenCalled();
});
