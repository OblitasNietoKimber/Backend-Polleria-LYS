/**
 * Utilidades de geolocalización y delimitación de cobertura para el distrito de Carabayllo, Lima.
 */

// Centro urbano de Carabayllo (Plaza de Armas / Túpac Amaru / San Pedro)
export const CARABAYLLO_CENTER = [-11.8784, -77.0342]

// Límites geográficos aproximados de la zona de reparto en Carabayllo
export const CARABAYLLO_BOUNDS = {
  minLat: -11.945,
  maxLat: -11.750,
  minLng: -77.085,
  maxLng: -76.960,
}

// Polígono que delimita visualmente el área de reparto de Carabayllo en el mapa
export const CARABAYLLO_ZONE_POLYGON = [
  [-11.750, -77.035],
  [-11.770, -76.990],
  [-11.820, -76.960],
  [-11.880, -76.965],
  [-11.930, -77.010],
  [-11.942, -77.045],
  [-11.925, -77.070],
  [-11.885, -77.085],
  [-11.820, -77.075],
  [-11.770, -77.055],
]

/**
 * Verifica si un punto geográfico se encuentra dentro del área de cobertura de Carabayllo.
 */
export function isWithinCarabayllo(point) {
  if (!point || typeof point !== 'object') return false
  const lat = Number(point.lat)
  const lng = Number(point.lng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false

  return (
    lat >= CARABAYLLO_BOUNDS.minLat &&
    lat <= CARABAYLLO_BOUNDS.maxLat &&
    lng >= CARABAYLLO_BOUNDS.minLng &&
    lng <= CARABAYLLO_BOUNDS.maxLng
  )
}

/**
 * Valida si un objeto contiene coordenadas latitud/longitud válidas.
 */
export function isValidPoint(point) {
  if (!point || typeof point !== 'object') return false
  const lat = Number(point.lat)
  const lng = Number(point.lng)
  return Number.isFinite(lat) && Math.abs(lat) <= 90 && Number.isFinite(lng) && Math.abs(lng) <= 180
}

/**
 * Realiza geocodificación inversa para obtener la dirección legible a partir de coordenadas en Carabayllo.
 */
export async function reverseGeocodeCarabayllo(lat, lng, signal) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`
    const res = await fetch(url, {
      signal,
      headers: {
        'Accept-Language': 'es',
      },
    })
    if (!res.ok) return null
    const data = await res.json()
    const addr = data.address || {}
    const road = addr.road || addr.pedestrian || addr.suburb || addr.neighbourhood || addr.city_district || ''
    const houseNumber = addr.house_number || ''
    const street = [road, houseNumber].filter(Boolean).join(' ')
    if (street) {
      return `${street}, Carabayllo`
    }
    const displayName = data.display_name ? data.display_name.split(',').slice(0, 2).join(',') : ''
    return displayName ? `${displayName}, Carabayllo` : 'Carabayllo, Lima'
  } catch {
    return null
  }
}

const searchCache = new Map()

/**
 * Busca sugerencias de calles y direcciones acotadas exclusivamente al distrito de Carabayllo, Lima.
 */
export async function searchCarabaylloAddresses(query, signal) {
  const trimmed = query.trim()
  if (trimmed.length < 3) return []
  const term = `${trimmed}, Carabayllo, Lima`
  if (searchCache.has(term)) return searchCache.get(term)

  try {
    const url = new URL('https://photon.komoot.io/api/')
    url.searchParams.set('q', term)
    url.searchParams.set('limit', '6')
    url.searchParams.set('countrycode', 'PE')
    url.searchParams.set('lat', String(CARABAYLLO_CENTER[0]))
    url.searchParams.set('lon', String(CARABAYLLO_CENTER[1]))
    url.searchParams.set('bbox', '-77.09,-11.95,-76.95,-11.75')
    url.searchParams.append('layer', 'street')
    url.searchParams.append('layer', 'house')

    const res = await fetch(url, { signal, credentials: 'omit' })
    if (!res.ok) return []
    const data = await res.json()
    const results = []

    for (const feature of Array.isArray(data.features) ? data.features : []) {
      const props = feature?.properties
      const coords = feature?.geometry?.coordinates
      if (!props || !Array.isArray(coords)) continue

      const point = { lat: Number(coords[1].toFixed(6)), lng: Number(coords[0].toFixed(6)) }
      const title = [props.street || props.name, props.housenumber].filter(Boolean).join(' ')
      if (!title) continue

      const context = [props.district || 'Carabayllo', 'Lima Norte'].filter(Boolean).join(', ')
      const id = `${title}:${context}:${point.lat}:${point.lng}`

      if (!results.some((r) => r.id === id)) {
        results.push({
          id,
          title,
          context,
          point,
          inCarabayllo: isWithinCarabayllo(point),
        })
      }
    }

    if (searchCache.size >= 50) {
      searchCache.delete(searchCache.keys().next().value)
    }
    searchCache.set(term, results)
    return results
  } catch {
    return []
  }
}
