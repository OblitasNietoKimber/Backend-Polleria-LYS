import { useSyncExternalStore } from 'react'
import { liveUpdatesUnavailable, subscribeLiveStatus } from '../services/orderUpdates'
import { Outlet } from 'react-router-dom'
import SiteHeader from '../components/SiteHeader'
import CartDrawer from '../components/CartDrawer'
import { CartProvider } from '../context/CartContext'

export default function MainLayout() {
  const liveUnavailable = useSyncExternalStore(subscribeLiveStatus, liveUpdatesUnavailable)
  return (
    <CartProvider>
      <div className="app-shell">
        <SiteHeader />
        {liveUnavailable && <p role="status">Actualización en vivo no disponible. Recarga la página si necesitas consultar los cambios.</p>}
        <Outlet />
        <CartDrawer />
      </div>
    </CartProvider>
  )
}
