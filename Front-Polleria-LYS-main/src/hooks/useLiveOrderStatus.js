import { useEffect, useState } from 'react'
import orderService from '../services/orderService'

export function useLiveOrderStatus(order, intervalMs = 15000) {
  const [probe, setProbe] = useState(null)
  const id = order?.id
  useEffect(() => {
    if (!id) return
    let active = true
    let busy = false
    const refresh = async () => {
      if (busy || document.visibilityState === 'hidden') return
      busy = true
      try {
        const latest = await orderService.getOrderState(id)
        if (active && latest) setProbe({ id, status: orderService.getOrderStatus({ backendStatus: latest.estado }) })
      } catch { /* Conserva el estado confirmado ante errores transitorios. */ }
      finally { busy = false }
    }
    refresh()
    const timer = setInterval(refresh, intervalMs)
    document.addEventListener('visibilitychange', refresh)
    return () => { active = false; clearInterval(timer); document.removeEventListener('visibilitychange', refresh) }
  }, [id, intervalMs])
  return probe?.id === id ? probe.status : order ? orderService.getOrderStatus(order) : null
}
