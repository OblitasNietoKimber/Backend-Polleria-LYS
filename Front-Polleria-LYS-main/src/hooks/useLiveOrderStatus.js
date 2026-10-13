import { useEffect, useState } from 'react'
import orderService from '../services/orderService'

export function useLiveOrderStatus(order, intervalMs = 15000) {
  const [status, setStatus] = useState(() => order ? orderService.getOrderStatus(order) : null)
  useEffect(() => {
    if (!order) return
    let active = true
    const refresh = async () => {
      try {
        const latest = await orderService.getOrderById(order.id)
        if (active && latest) setStatus(orderService.getOrderStatus(latest))
      } catch { /* Preserve the last confirmed status on transient network failures. */ }
    }
    refresh()
    const timer = setInterval(refresh, intervalMs)
    return () => { active = false; clearInterval(timer) }
  }, [order, intervalMs])
  return status
}
