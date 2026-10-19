import { requireInsforge } from '../lib/insforge';
import { getCurrentUser } from './authService';

export const ORDER_EVENT = 'lys:pedido-actualizado';
const channels = new Map();
export async function getOrderChangeStamp() {
  const user = getCurrentUser();
  if (!user) throw new Error('Debes iniciar sesión.');
  let query = requireInsforge().database.from('pedidos')
    .select('actualizado_en', { count: 'exact' }).order('actualizado_en', { ascending: false }).limit(1);
  if (user.rol === 'cliente') query = query.eq('cliente_id', user.id);
  const { data, count, error } = await query;
  if (error) throw new Error(error.message || 'No se pudieron comprobar los cambios.');
  return JSON.stringify([count, data?.[0]?.actualizado_en ?? null]);
}
export function watchOrders(refresh, { intervalMs = 10000, initialRefresh = true, poll = true } = {}) {
  const user = getCurrentUser();
  if (!user) { let active = true; queueMicrotask(() => { if (active && initialRefresh) refresh(); }); return () => { active = false; }; }
  const channel = user.rol === 'cliente' ? `lys:client:${user.id}` : 'lys:staff';
  let entry = channels.get(channel);
  if (!entry) {
    const realtime = requireInsforge().realtime;
    entry = { listeners: new Map(), stamp: null, busy: false, timer: null, realtime };
    const broadcast = () => entry.listeners.forEach((_interval, listener) => listener());
    entry.connected = broadcast;
    entry.message = payload => {
      if (payload?.meta?.channel === channel && payload.meta.senderType === 'system') broadcast();
    };
    entry.check = async () => {
      if (entry.busy || !entry.listeners.size || document.visibilityState === 'hidden') return;
      entry.busy = true;
      try {
        const stamp = await getOrderChangeStamp();
        if (entry.listeners.size && stamp !== entry.stamp) { entry.stamp = stamp; broadcast(); }
      } catch { if (entry.listeners.size) broadcast(); }
      finally { entry.busy = false; }
    };
    entry.visible = () => { if (document.visibilityState !== 'hidden') { broadcast(); void entry.check(); } };
    channels.set(channel, entry);
    document.addEventListener('visibilitychange', entry.visible);
    window.addEventListener('online', entry.visible);
    window.addEventListener('focus', entry.visible);
    if (realtime) {
      realtime.on(ORDER_EVENT, entry.message);
      realtime.on('connect', entry.connected);
      void realtime.connect().then(async () => {
        if (!entry.listeners.size) return;
        const result = await realtime.subscribe(channel);
        if (!entry.listeners.size && !channels.has(channel)) realtime.unsubscribe(channel);
        if (result.ok) broadcast();
      }).catch(() => {});
    }
  }
  let active = true;
  const notify = () => { if (active) refresh(); };
  entry.listeners.set(notify, poll ? intervalMs : Infinity);
  const schedule = () => {
    clearInterval(entry.timer);
    const intervals = [...entry.listeners.values()].filter(Number.isFinite);
    if (intervals.length) entry.timer = setInterval(entry.check, Math.min(...intervals));
  };
  schedule();
  queueMicrotask(() => { if (initialRefresh) notify(); if (active && poll) void entry.check(); });
  return () => {
    if (!active) return;
    active = false;
    entry.listeners.delete(notify);
    schedule();
    if (!entry.listeners.size) {
      channels.delete(channel);
      document.removeEventListener('visibilitychange', entry.visible);
      window.removeEventListener('online', entry.visible);
      window.removeEventListener('focus', entry.visible);
      entry.realtime?.off(ORDER_EVENT, entry.message);
      entry.realtime?.off('connect', entry.connected);
      entry.realtime?.unsubscribe(channel);
      if (!channels.size) entry.realtime?.disconnect();
    }
  };
}
