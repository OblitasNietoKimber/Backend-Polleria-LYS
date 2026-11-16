import { useEffect, useId, useRef, useState } from 'react'
import { MapPin, Search, Loader2, CheckCircle2 } from 'lucide-react'
import { searchCarabaylloAddresses } from '../utils/carabaylloLocation'

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
  const [suggestions, setSuggestions] = useState([])
  const [loading, setLoading] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const containerRef = useRef(null)

  // Búsqueda asistida en tiempo real con debounce
  useEffect(() => {
    if (!open || !value || value.trim().length < 3) {
      setSuggestions([])
      setLoading(false)
      return
    }

    const controller = new AbortController()
    let cancelled = false
    setLoading(true)

    const timer = setTimeout(async () => {
      try {
        const results = await searchCarabaylloAddresses(value, controller.signal)
        if (!cancelled) {
          setSuggestions(results)
          setLoading(false)
        }
      } catch {
        if (!cancelled) {
          setSuggestions([])
          setLoading(false)
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
    setOpen(false)
    setSuggestions([])
    setHighlightedIndex(-1)

    const formattedAddress = item.title.toLowerCase().includes('carabayllo')
      ? item.title
      : `${item.title}, Carabayllo`

    onChange(formattedAddress)
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
        <input
          id={id}
          className={`lys-input ${error ? 'err' : ''}`}
          value={value}
          onChange={(e) => {
            onChange(e.target.value)
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
          maxLength={120}
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
              No se encontraron coincidencias exactas. Puedes ingresar tu dirección manualmente.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
