import { useCallback, useEffect, useRef, useState } from 'react';
import { watchOrders } from '../services/orderUpdates';
export default function useOrderResource(load, intervalMs = 10000) {
  const [result, setResult] = useState({ source: null, data: null, loading: true, error: '' });
  const reload = useRef(() => Promise.resolve());
  const retry = useCallback(() => reload.current(), []);
  useEffect(() => {
    let active = true, pending = false, running = null;
    function refresh() {
      if (!active) return Promise.resolve();
      if (running) { pending = true; return running; }
      running = (async () => {
        do {
          pending = false;
          try {
            const data = await load();
            if (active) setResult({ source: load, data, loading: false, error: '' });
          } catch (error) {
            if (active) setResult(previous => ({ source: load,
              data: previous.source === load ? previous.data : null, loading: false,
              error: error.message || 'No se pudo actualizar el pedido.' }));
          }
        } while (active && pending);
      })().finally(() => { running = null; });
      return running;
    }
    reload.current = refresh;
    const stop = watchOrders(refresh, { intervalMs });
    return () => { active = false; stop(); };
  }, [load, intervalMs]);
  return result.source === load ? { ...result, retry } : { data: null, loading: true, error: '', retry };
}
