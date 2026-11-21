import { useEffect, useState } from 'react'
import { watchCatalog } from '../services/orderUpdates'

const categoryChanged = change => change.recurso === 'categorias'
const productChanged = change => change.recurso !== 'categorias'

export function useCatalogResource(load, key, delay = 0, { category = false, update } = {}) {
  const [revision, setRevision] = useState(0)
  const requestKey = `${key}:${revision}`
  const [state, setState] = useState({ key: null, data: null, error: '' })
  useEffect(() => {
    let active = true, running = false, pending, data
    const refresh = async (changes = null) => {
      if (changes) {
        changes = changes.filter(category ? categoryChanged : productChanged)
        if (!changes.length) return
      }
      pending = changes === null || pending === null ? null : [...(pending || []), ...changes]
      if (running) return
      running = true
      do {
        const events = pending
        pending = undefined
        try {
          data = events && update && data ? await update(data, events) : await load()
          if (active) setState({ key: requestKey, data, error: '' })
        } catch (error) {
          if (active && data === undefined) setState({ key: requestKey, data: null, error: error.message })
        }
      } while (active && pending !== undefined)
      running = false
    }
    let stop
    const timer = setTimeout(() => { stop = watchCatalog(refresh) }, delay)
    const refreshLocal = () => { if (!category) void refresh() }
    window.addEventListener('catalog-stock-changed', refreshLocal)
    return () => {
      active = false
      clearTimeout(timer)
      stop?.()
      window.removeEventListener('catalog-stock-changed', refreshLocal)
    }
  }, [load, requestKey, delay, category, update])
  const current = state.key === requestKey
  return {
    data: current ? state.data : null,
    loading: !current,
    error: current ? state.error : '',
    retry: () => setRevision(value => value + 1),
  }
}
