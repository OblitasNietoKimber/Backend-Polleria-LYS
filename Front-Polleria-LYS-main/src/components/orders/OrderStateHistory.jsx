import { useCallback, useState } from 'react'
import orderService, { getStatusLabel } from '../../services/orderService'
import useOrderResource from '../../hooks/useOrderResource'

export default function OrderStateHistory({ orderId }) {
  const [before, setBefore] = useState(null)
  const load = useCallback(() => orderService.getOrderHistory(orderId, { before }), [orderId, before])
  const { data, loading, error, retry } = useOrderResource(load)
  const entries = data || []
  return (
    <section aria-label="Historial de estados" className="order-status-history">
      <h2>Historial de estados</h2>
      <button className="btn-outline" onClick={() => { setBefore(null); retry() }}>Actualizar historial</button>
      {loading ? <p role="status">Cargando historial...</p> : error ? (
        <div><p role="alert">{error}</p><button className="btn-outline" onClick={retry}>Reintentar historial</button></div>
      ) : <>
        <ol>
          {entries.map(entry => <li key={entry.id}>
            <strong>{getStatusLabel(entry.estado)}</strong>
            {entry.estado_anterior && <span> · Antes: {getStatusLabel(entry.estado_anterior)}</span>}
            <time dateTime={entry.cambiado_en}>{new Date(entry.cambiado_en).toLocaleString('es-PE')}</time>
            {entry.es_reconstruido && <small>Estado conocido al incorporar el historial; la fecha corresponde a ese registro.</small>}
          </li>)}
        </ol>
        {!entries.length && <p>No hay cambios de estado registrados.</p>}
        {entries.length === 50 && <button className="btn-outline" onClick={() => setBefore(entries.at(-1).id)}>Ver estados anteriores</button>}
      </>}
    </section>
  )
}
