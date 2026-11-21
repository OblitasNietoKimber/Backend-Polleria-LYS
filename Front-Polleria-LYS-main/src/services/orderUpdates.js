import { requireInsforge } from '../lib/insforge';
import { getCurrentUser } from './authService';

export const ORDER_EVENT = 'lys:pedido-actualizado';
export const MESA_EVENT = 'lys:mesa-actualizada';
export const KITCHEN_HISTORY_EVENT = 'lys:entrega-cocina-actualizada';
export const PAYMENT_EVENT = 'lys:pago-actualizado';
export const RETURN_EVENT = 'lys:incidencia-actualizada';
export const CATALOG_EVENT = 'lys:catalogo-actualizado';
const channels = new Map();
const statusListeners = new Set();

export function subscribeLiveStatus(listener) {
  statusListeners.add(listener);
  return () => statusListeners.delete(listener);
}

export function liveUpdatesUnavailable() {
  return [...channels.values()].some(entry => entry.unavailable);
}

function watchChannel(channel, events, refresh) {
  let active = true;
  const initial = () => { if (active) refresh(null); };
  let realtime;
  try { if (channel) realtime = requireInsforge().realtime; } catch { /* The initial read reports configuration errors. */ }
  if (!realtime) {
    queueMicrotask(initial);
    return () => { active = false; };
  }

  let entry = channels.get(channel);
  if (!entry) {
    const listeners = new Set();
    const handlers = new Map();
    const pending = new Map();
    let timer, subscription, connectionGeneration = 0;
    let ready = false, readyBefore = false, recovery = false, attempted = false, suspended = false;
    entry = { listeners, unavailable: false };
    channels.set(channel, entry);

    function setUnavailable(unavailable) {
      if (entry.unavailable === unavailable) return;
      entry.unavailable = unavailable;
      statusListeners.forEach(listener => listener());
    }
    function flush() {
      clearTimeout(timer);
      timer = undefined;
      if (document.visibilityState === 'hidden') return;
      const updates = [...pending.values()];
      pending.clear();
      if (updates.length) listeners.forEach(listener => listener(updates));
    }
    function resync() {
      if (document.visibilityState === 'hidden') { pending.clear(); suspended = true; return; }
      clearTimeout(timer);
      timer = undefined;
      pending.clear();
      listeners.forEach(listener => listener(null));
    }
    function subscribe() {
      if (subscription || ready || channels.get(channel) !== entry) return;
      const generation = connectionGeneration;
      const task = (async () => {
        try {
          await realtime.connect();
          if (generation !== connectionGeneration || channels.get(channel) !== entry) return;
          const result = await realtime.subscribe(channel);
          if (generation !== connectionGeneration || channels.get(channel) !== entry) return;
          if (!result.ok) throw new Error('Realtime subscription unavailable');
          ready = true;
          setUnavailable(false);
          if (recovery || !readyBefore) resync();
          readyBefore = true;
          recovery = false;
        } catch {
          if (generation === connectionGeneration && channels.get(channel) === entry) {
            recovery = true;
            setUnavailable(true);
          }
        }
      })();
      subscription = task;
      attempted = true;
      void task.finally(() => { if (subscription === task) subscription = undefined; });
    }
    function disconnect() {
      connectionGeneration += 1;
      subscription = undefined;
      ready = false;
      recovery = true;
      setUnavailable(true);
    }
    function resume() {
      if (document.visibilityState === 'hidden') return;
      if (suspended) { suspended = false; resync(); }
      else flush();
      if (!ready) subscribe();
    }

    entry.addEvent = event => {
      if (handlers.has(event)) return;
      const handler = payload => {
        if (payload?.meta?.channel !== channel || payload.meta.senderType !== 'system') return;
        const { pedidoId, recurso, tipo, inventarioId, productoId } = payload;
        if (suspended) return;
        pending.set(JSON.stringify([event, pedidoId, recurso, inventarioId, productoId]), { event, pedidoId, recurso, tipo, inventarioId, productoId });
        if (pending.size > 100) { resync(); return; }
        if (document.visibilityState !== 'hidden' && timer === undefined) timer = setTimeout(flush, 100);
      };
      handlers.set(event, handler);
      realtime.on(event, handler);
    };
    entry.start = () => { if (!attempted) subscribe(); };
    entry.isReady = () => ready;
    entry.stop = () => {
      clearTimeout(timer);
      for (const [event, handler] of handlers) realtime.off(event, handler);
      realtime.off('connect', subscribe);
      realtime.off('disconnect', disconnect);
      window.removeEventListener('online', resume);
      document.removeEventListener('visibilitychange', resume);
      realtime.unsubscribe(channel);
      if (!channels.size) realtime.disconnect();
      if (entry.unavailable) statusListeners.forEach(listener => listener());
    };
    realtime.on('connect', subscribe);
    realtime.on('disconnect', disconnect);
    window.addEventListener('online', resume);
    document.addEventListener('visibilitychange', resume);
  }

  const topics = new Set(events);
  topics.forEach(entry.addEvent);
  let initialized = false;
  const notify = updates => {
    const relevant = updates?.filter(update => topics.has(update.event));
    if (!active || (updates !== null && !relevant.length)) return;
    refresh(initialized ? relevant ?? null : null);
    initialized = true;
  };
  entry.listeners.add(notify);
  const initialRead = setTimeout(() => { if (!initialized) notify(null); }, entry.isReady() ? 0 : 250);
  entry.start();
  return () => {
    active = false;
    clearTimeout(initialRead);
    entry.listeners.delete(notify);
    if (!entry.listeners.size) {
      channels.delete(channel);
      entry.stop();
    }
  };
}

export function watchOrders(refresh, { events = [ORDER_EVENT] } = {}) {
  const user = getCurrentUser();
  const channel = !user ? null : user.rol === 'cliente' ? `lys:client:${user.id}` : 'lys:staff';
  return watchChannel(channel, events, refresh);
}

export function watchCatalog(refresh) {
  return watchChannel('lys:catalogo', [CATALOG_EVENT], refresh);
}
