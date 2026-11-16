import { useEffect, useState } from 'react'

export function useCatalogResource(load, key, delay = 0) {
  const [revision, setRevision] = useState(0)
  const requestKey = `${key}:${revision}`
  const [state, setState] = useState({ key: null, data: null, error: '' })
  useEffect(() => {
    let active = true
    const timer = setTimeout(() => Promise.resolve().then(load).then(data => {
      if (active) setState({ key: requestKey, data, error: '' })
    }).catch(error => {
      if (active) setState({ key: requestKey, data: null, error: error.message })
    }), delay)
    const refresh = () => {
      if (document.visibilityState === 'hidden') return
      Promise.resolve().then(load).then(data => {
        if (active) setState({ key: requestKey, data, error: '' })
      }).catch(() => { /* La próxima consulta o reintento vuelve a comprobar el catálogo. */ })
    }
    const interval = setInterval(refresh, 20000)
    window.addEventListener('catalog-stock-changed', refresh)
    window.addEventListener('focus', refresh)
    return () => {
      active = false; clearTimeout(timer); clearInterval(interval)
      window.removeEventListener('catalog-stock-changed', refresh)
      window.removeEventListener('focus', refresh)
    }
  }, [load, requestKey, delay])
  const current = state.key === requestKey
  return {
    data: current ? state.data : null,
    loading: !current,
    error: current ? state.error : '',
    retry: () => setRevision(value => value + 1),
  }
}
