import { useCallback, useEffect, useRef, useState } from 'react';
import { watchOrders } from '../services/orderUpdates';

export default function useOrderResource(load, { events, orderId, update, filter } = {}) {
  const [result, setResult] = useState({ source: null, data: null, loading: true, error: '' });
  const reload = useRef(() => Promise.resolve());
  const retry = useCallback(updates => reload.current(updates), []);
  useEffect(() => {
    let active = true, pending, running = null, currentData, loaded = false;

    function refresh(updates = null) {
      if (!active) return Promise.resolve();
      if (updates && filter) updates = updates.filter(filter);
      if (updates && !updates.length) return Promise.resolve();
      if (updates && orderId && !updates.some(item => !item.pedidoId || item.pedidoId === orderId)) return Promise.resolve();
      pending = updates === null || pending === null ? null : [...(pending || []), ...updates];
      if (running) return running;
      running = (async () => {
        do {
          const changes = pending;
          pending = undefined;
          try {
            currentData = changes && loaded && update ? await update(currentData, changes) : await load();
            loaded = true;
            if (active) setResult({ source: load, data: currentData, loading: false, error: '' });
          } catch (error) {
            loaded = false;
            if (active) setResult({ source: load, data: currentData ?? null, loading: false,
              error: error.message || 'No se pudo actualizar el pedido.' });
          }
        } while (active && pending !== undefined);
      })().finally(() => { running = null; });
      return running;
    }

    reload.current = updates => refresh(Array.isArray(updates) ? updates : null);
    const stop = watchOrders(refresh, { events });
    return () => { active = false; stop(); };
  }, [load, events, orderId, update, filter]);
  return result.source === load ? { ...result, retry } : { data: null, loading: true, error: '', retry };
}
