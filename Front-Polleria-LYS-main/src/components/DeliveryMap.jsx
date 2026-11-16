import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { MapPin, Locate, AlertTriangle, CheckCircle2, Crosshair, Compass, Info } from 'lucide-react'
import {
  CARABAYLLO_CENTER,
  CARABAYLLO_ZONE_POLYGON,
  isWithinCarabayllo,
  isValidPoint,
  reverseGeocodeCarabayllo,
} from '../utils/carabaylloLocation'

// Icono personalizado de pin para el punto de entrega en estilo Pollería LYS
const customDeliveryPin = L.divIcon({
  className: 'lys-delivery-pin',
  iconSize: [36, 46],
  iconAnchor: [18, 46],
  popupAnchor: [0, -42],
  html: `
    <svg viewBox="0 0 34 44" width="36" height="46" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M17 1C8.163 1 1 8.163 1 17C1 28.5 17 43 17 43S33 28.5 33 17C33 8.163 25.837 1 17 1Z" fill="#DC2626" stroke="#FFFFFF" stroke-width="2.5" />
      <circle cx="17" cy="17" r="6" fill="#FFFFFF" />
      <circle cx="17" cy="17" r="3" fill="#991B1B" />
    </svg>
  `,
})

export default function DeliveryMap({ point, onChange, onAddressDetected }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const markerRef = useRef(null)
  const polygonRef = useRef(null)
  const [locating, setLocating] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')
  const [isOutOfZone, setIsOutOfZone] = useState(false)
  const [isReverseGeocoding, setIsReverseGeocoding] = useState(false)

  // Inicialización del mapa de Leaflet
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const initialPoint = isValidPoint(point) ? [point.lat, point.lng] : CARABAYLLO_CENTER

    const map = L.map(containerRef.current, {
      center: initialPoint,
      zoom: 14,
      minZoom: 12,
      maxZoom: 18,
      maxBounds: [
        [-12.02, -77.18],
        [-11.60, -76.85],
      ],
      scrollWheelZoom: true, // Habilitar zoom con la rueda del ratón (scroll)
      wheelDebounceTime: 60,
      zoomAnimation: true,
    })

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · Pollería LYS',
    }).addTo(map)

    // Dibujar polígono con la zona de cobertura de Carabayllo
    const zonePolygon = L.polygon(CARABAYLLO_ZONE_POLYGON, {
      color: '#EA580C',
      weight: 2,
      fillColor: '#EA580C',
      fillOpacity: 0.08,
      dashArray: '6, 6',
    }).addTo(map)

    zonePolygon.bindTooltip('Zona de Reparto Exclusiva — Carabayllo', {
      permanent: false,
      direction: 'top',
      className: 'lys-map-tooltip',
    })

    polygonRef.current = zonePolygon

    // Evento de clic en el mapa
    map.on('click', (e) => {
      const clicked = {
        lat: Number(e.latlng.lat.toFixed(6)),
        lng: Number(e.latlng.lng.toFixed(6)),
      }
      handleLocationSelect(clicked, map)
    })

    // ResizeObserver para mantener el tamaño responsive al redimensionar la ventana
    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize({ pan: false })
    })
    resizeObserver.observe(containerRef.current)

    mapRef.current = map

    return () => {
      resizeObserver.disconnect()
      map.remove()
      mapRef.current = null
      markerRef.current = null
    }
  }, [])

  // Sincronización del marcador si cambia `point` desde props (ej. por autocompletado de dirección)
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    if (!isValidPoint(point)) {
      if (markerRef.current) {
        markerRef.current.remove()
        markerRef.current = null
      }
      setIsOutOfZone(false)
      return
    }

    const inZone = isWithinCarabayllo(point)
    setIsOutOfZone(!inZone)

    if (!inZone) {
      setStatusMessage('Ubicación fuera del área de reparto en Carabayllo.')
    } else {
      setStatusMessage('Punto seleccionado dentro de la zona de Carabayllo.')
    }

    if (!markerRef.current) {
      const marker = L.marker([point.lat, point.lng], {
        icon: customDeliveryPin,
        draggable: true,
        title: 'Arrastra el pin hasta la puerta de tu domicilio',
      }).addTo(map)

      marker.on('dragend', () => {
        const pos = marker.getLatLng()
        const next = {
          lat: Number(pos.lat.toFixed(6)),
          lng: Number(pos.lng.toFixed(6)),
        }
        handleLocationSelect(next, map)
      })

      markerRef.current = marker
    } else {
      markerRef.current.setLatLng([point.lat, point.lng])
    }

    map.setView([point.lat, point.lng], Math.max(map.getZoom(), 15), { animate: true })
  }, [point])

  async function handleLocationSelect(selectedPoint, mapInstance = mapRef.current) {
    if (!isWithinCarabayllo(selectedPoint)) {
      setIsOutOfZone(true)
      setStatusMessage('La ubicación seleccionada está fuera de nuestra zona de cobertura en Carabayllo.')

      if (markerRef.current) {
        markerRef.current.setLatLng([selectedPoint.lat, selectedPoint.lng])
      } else if (mapInstance) {
        markerRef.current = L.marker([selectedPoint.lat, selectedPoint.lng], {
          icon: customDeliveryPin,
          draggable: true,
        }).addTo(mapInstance)
      }
      onChange({ ...selectedPoint, outOfZone: true })
      return
    }

    setIsOutOfZone(false)
    setStatusMessage('Punto confirmado dentro de Carabayllo.')
    onChange(selectedPoint)

    // Geocodificación inversa automática para autocompletar la dirección de la calle
    setIsReverseGeocoding(true)
    const detected = await reverseGeocodeCarabayllo(selectedPoint.lat, selectedPoint.lng)
    setIsReverseGeocoding(false)

    const finalAddress = detected || `Carabayllo (${selectedPoint.lat.toFixed(4)}, ${selectedPoint.lng.toFixed(4)})`
    if (onAddressDetected) {
      onAddressDetected(finalAddress)
    }
  }

  function handleUseMyLocation() {
    if (!navigator.geolocation) {
      setStatusMessage('Tu navegador no admite geolocalización. Selecciona tu punto en el mapa.')
      return
    }

    setLocating(true)
    setStatusMessage('Obteniendo tu ubicación actual por GPS…')

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false)
        const myLocation = {
          lat: Number(pos.coords.latitude.toFixed(6)),
          lng: Number(pos.coords.longitude.toFixed(6)),
        }

        if (mapRef.current) {
          mapRef.current.setView([myLocation.lat, myLocation.lng], 16, { animate: true })
        }

        if (!isWithinCarabayllo(myLocation)) {
          setIsOutOfZone(true)
          setStatusMessage(
            'Tu ubicación actual está fuera de Carabayllo. Marca tu dirección directamente en el mapa dentro de la zona destacada.'
          )
          return
        }

        handleLocationSelect(myLocation)
      },
      (err) => {
        setLocating(false)
        if (err.code === 1) {
          setStatusMessage('Permiso de ubicación denegado. Puedes marcar tu ubicación directamente en el mapa.')
        } else {
          setStatusMessage('No se pudo obtener la ubicación. Por favor, selecciona el punto en el mapa.')
        }
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    )
  }

  function handleRecenter() {
    if (!mapRef.current) return
    if (isValidPoint(point)) {
      mapRef.current.setView([point.lat, point.lng], Math.max(mapRef.current.getZoom(), 16), { animate: true })
      setStatusMessage('Mapa reenfocado en la dirección seleccionada.')
    } else {
      mapRef.current.setView(CARABAYLLO_CENTER, 14, { animate: true })
      setStatusMessage('Mapa enfocado en la zona de reparto de Carabayllo.')
    }
  }

  const hasPoint = isValidPoint(point)

  return (
    <div className="delivery-map-wrapper">
      <div className="delivery-map-header">
        <div className="delivery-map-title-wrap">
          <div className="delivery-map-icon-box">
            <MapPin size={22} color="#DC2626" />
          </div>
          <div>
            <div className="delivery-map-title-row">
              <h3 className="delivery-map-title">Ubicación de entrega</h3>
              <span className="delivery-map-district-badge">Zona Carabayllo</span>
            </div>
            <p className="delivery-map-subtitle">Toca el mapa o arrastra el pin hasta tu puerta. Scroll para zoom.</p>
          </div>
        </div>

        <div className="delivery-map-toolbar-actions">
          <button
            type="button"
            className="btn-outline delivery-btn-sm"
            onClick={handleUseMyLocation}
            disabled={locating}
            title="Usar GPS de mi dispositivo"
          >
            <Locate size={14} className={locating ? 'spin' : ''} />
            {locating ? 'Ubicando…' : 'Mi ubicación'}
          </button>
          <button
            type="button"
            className="btn-outline delivery-btn-sm"
            onClick={handleRecenter}
            title={hasPoint ? 'Volver a enfocar el marcador en tu dirección' : 'Enfocar la zona completa de Carabayllo'}
          >
            {hasPoint ? <Crosshair size={14} /> : <Compass size={14} />}
            {hasPoint ? 'Reenfocar mi punto' : 'Ver zona Carabayllo'}
          </button>
        </div>
      </div>

      {/* Tarjeta del mapa con soporte de zoom por scroll */}
      <div className="delivery-map-canvas-card">
        <div
          className={`delivery-map-container ${isOutOfZone ? 'map-border-warning' : ''}`}
          ref={containerRef}
          role="region"
          aria-label="Mapa interactivo de entrega en Carabayllo"
        />
        <div className="delivery-map-floating-zoom-hint" aria-hidden="true">
          <span>Scroll con rueda para zoom</span>
        </div>
      </div>

      {/* Barra de estado y validación de cobertura */}
      <div className="delivery-map-status-bar">
        {isOutOfZone ? (
          <div className="delivery-status-alert alert-warning" role="alert">
            <AlertTriangle size={16} />
            <span>
              <strong>Fuera de cobertura:</strong> Solo realizamos delivery en el distrito de Carabayllo. Selecciona
              un punto dentro del área delimitada.
            </span>
          </div>
        ) : hasPoint ? (
          <div className="delivery-status-alert alert-success" role="status">
            <CheckCircle2 size={16} />
            <span>
              <strong>Punto fijado en Carabayllo</strong> ({point.lat.toFixed(4)}, {point.lng.toFixed(4)})
              {isReverseGeocoding && ' · Identificando calle…'}
            </span>
          </div>
        ) : (
          <div className="delivery-status-alert alert-neutral" role="status">
            <Info size={15} />
            <span>{statusMessage || 'Haz clic en el mapa para fijar la entrada de tu domicilio en Carabayllo.'}</span>
          </div>
        )}
      </div>
    </div>
  )
}
