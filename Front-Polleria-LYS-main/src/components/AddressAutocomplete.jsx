import { useEffect, useId, useRef, useState } from 'react'
import { MapPin, Search, Loader2, CheckCircle2 } from 'lucide-react'
import { isWithinCarabayllo, searchCarabaylloAddresses } from '../utils/carabaylloLocation'
import FixedLengthInput from './common/FixedLengthInput'
import { DELIVERY_LIMITS } from '../utils/deliveryValidation'

export default function AddressAutocomplete({
  value = '',
  onChange,
  onSelectLocation,
  placeholder = 'Ej. Av. Túpac Amaru 1250, Jr. Manuel Prado 450...',
  error = '',
  disabled = false,
}) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const [result, setResult] = useState({ query: '', items: [], loading: false })
  const suggestions = result.query === value ? result.items : []
  const loading = open && value.trim().length >= 3 && (result.query !== value || result.loading)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const containerRef = useRef(null)

  // Búsqueda asistida en tiempo real con debounce
  useEffect(() => {
    if (!open || !value || value.trim().length < 3) {
      return
    }

    const controller = new AbortController()
    let cancelled = false

    const timer = setTimeout(async () => {
      setResult({ query: value, items: [], loading: true })
      try {
        const results = await searchCarabaylloAddresses(value, controller.signal)
        if (!cancelled) {
          setResult({ query: value, items: results, loading: false })
        }
      } catch {
        if (!cancelled) {
          setResult({ query: value, items: [], loading: false })
        }
      }
    }, 450)

    return () => {
      cancelled = true
      clearTimeout(timer)
      controller.abort()
    }
  }, [value, open])

  // Cierra el menú al hacer clic fuera del componente
  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  function handleSelect(item) {
    if (!isWithinCarabayllo(item.point)) return
    setOpen(false)
    setResult({ query: '', items: [], loading: false })
    setHighlightedIndex(-1)

    const formattedAddress = item.title.toLowerCase().includes('carabayllo')
      ? item.title
      : `${item.title}, Carabayllo`

    if (formattedAddress.length > DELIVERY_LIMITS.address) return
    if (onSelectLocation && item.point) {
      onSelectLocation(item.point, formattedAddress)
    }
  }

  function handleKeyDown(event) {
    if (!open || suggestions.length === 0) return

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setHighlightedIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : 0))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : suggestions.length - 1))
    } else if (event.key === 'Enter') {
      if (highlightedIndex >= 0 && highlightedIndex < suggestions.length) {
        event.preventDefault()
        handleSelect(suggestions[highlightedIndex])
      }
    } else if (event.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div className="address-autocomplete-container" ref={containerRef}>
      <div className="address-autocomplete-input-wrap">
        <FixedLengthInput
          id={id}
          className={`lys-input ${error ? 'err' : ''}`}
          value={value}
          onChange={(e) => {
            onChange(e.target.value.slice(0, DELIVERY_LIMITS.address))
            setOpen(true)
            setHighlightedIndex(-1)
          }}
          onFocus={() => {
            if (value && value.trim().length >= 3) {
              setOpen(true)
            }
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          maxLength={DELIVERY_LIMITS.address}
          disabled={disabled}
          autoComplete="off"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open && suggestions.length > 0}
        />
        <div className="address-autocomplete-icon-status" aria-hidden="true">
          {loading ? (
            <Loader2 size={16} className="spin text-ember" />
          ) : (
            <Search size={16} className="text-smoke" />
          )}
        </div>
      </div>

      {open && (suggestions.length > 0 || (loading && value.trim().length >= 3)) && (
        <div className="address-autocomplete-dropdown" role="listbox">
          <div className="address-dropdown-header">
            <span>Sugerencias en Carabayllo</span>
            <small>Zona de cobertura</small>
          </div>

          {suggestions.map((item, idx) => (
            <button
              key={item.id}
              type="button"
              className={`address-dropdown-item ${idx === highlightedIndex ? 'highlighted' : ''}`}
              onClick={() => handleSelect(item)}
              onMouseEnter={() => setHighlightedIndex(idx)}
              role="option"
              aria-selected={idx === highlightedIndex}
            >
              <div className="address-dropdown-item-icon">
                <MapPin size={16} />
              </div>
              <div className="address-dropdown-item-content">
                <strong className="address-item-title">{item.title}</strong>
                <span className="address-item-context">
                  {item.context}
                  {item.inCarabayllo && (
                    <span className="address-item-badge">
                      <CheckCircle2 size={11} /> Cobertura directa
                    </span>
                  )}
                </span>
              </div>
            </button>
          ))}

          {suggestions.length === 0 && loading && (
            <div className="address-dropdown-empty">
              <Loader2 size={15} className="spin" /> Buscando calles en Carabayllo…
            </div>
          )}

          {suggestions.length === 0 && !loading && (
            <div className="address-dropdown-empty">
              No se encontraron coincidencias exactas. Selecciona tu dirección en el mapa.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
