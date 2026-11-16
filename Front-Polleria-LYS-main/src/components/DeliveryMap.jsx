import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { MapPin, Locate, AlertTriangle, CheckCircle2, RotateCcw, Info } from 'lucide-react'
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
  iconSize: [34, 44],
  iconAnchor: [17, 44],
  popupAnchor: [0, -40],
  html: `
    <svg viewBox="0 0 34 44" width="34" height="44" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M17 1C8.163 1 1 8.163 1 17C1 28.5 17 43 17 43S33 28.5 33 17C33 8.163 25.837 1 17 1Z" fill="#EA580C" stroke="#FFFFFF" stroke-width="2.5" />
      <circle cx="17" cy="17" r="6" fill="#FFFFFF" />
      <circle cx="17" cy="17" r="3" fill="#C2410C" />
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
      scrollWheelZoom: false,
    })

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · Pollería LYS Carabayllo',
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

      // Colocar o mover marcador indicando visualmente el fuera de zona
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

    if (detected && onAddressDetected) {
      onAddressDetected(detected)
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

  function handleResetView() {
    if (mapRef.current) {
      mapRef.current.setView(CARABAYLLO_CENTER, 14, { animate: true })
      setStatusMessage('Mapa centrado en el distrito de Carabayllo.')
    }
  }

  return (
    <div className="delivery-map-wrapper">
      <div className="delivery-map-header">
        <div className="delivery-map-title-wrap">
          <MapPin size={18} className="text-ember" />
          <h3 className="delivery-map-title">Punto de entrega en mapa (Carabayllo)</h3>
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
            onClick={handleResetView}
            title="Centrar en Carabayllo"
          >
            <RotateCcw size={14} />
            Centrar
          </button>
        </div>
      </div>

      <p className="delivery-map-hint">
        <Info size={13} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 4 }} />
        Haz clic en el mapa o arrastra el marcador rojo para afinar la puerta de tu domicilio en Carabayllo.
      </p>

      {/* Contenedor interactivo de Leaflet */}
      <div
        className={`delivery-map-container ${isOutOfZone ? 'map-border-warning' : ''}`}
        ref={containerRef}
        role="region"
        aria-label="Mapa de selección de dirección en Carabayllo"
      />

      {/* Barra de estado y validación de cobertura */}
      <div className="delivery-map-status-bar">
        {isOutOfZone ? (
          <div className="delivery-status-alert alert-warning" role="alert">
            <AlertTriangle size={15} />
            <span>
              <strong>Fuera de cobertura:</strong> Solo realizamos envíos dentro de Carabayllo. Por favor, selecciona
              un punto dentro de la zona delimitada.
            </span>
          </div>
        ) : isValidPoint(point) ? (
          <div className="delivery-status-alert alert-success" role="status">
            <CheckCircle2 size={15} />
            <span>
              Ubicación fijada en Carabayllo ({point.lat.toFixed(4)}, {point.lng.toFixed(4)})
              {isReverseGeocoding && ' · Identificando calle…'}
            </span>
          </div>
        ) : (
          <div className="delivery-status-alert alert-neutral" role="status">
            <span>{statusMessage || 'Zona de reparto activa: Carabayllo, Lima Norte.'}</span>
          </div>
        )}
      </div>
    </div>
  )
}
