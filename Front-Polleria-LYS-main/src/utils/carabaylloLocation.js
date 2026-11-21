import boundary from './carabaylloBoundary.json'

// INEI 2017, publicado por MINAM. Fuente y fecha en carabaylloBoundary.json.
export const CARABAYLLO_CENTER = [-11.8784, -77.0342]
const rings = boundary.features[0].geometry.coordinates
export const CARABAYLLO_ZONE_POLYGON = rings.map(ring => ring.map(([lng, lat]) => [lat, lng]))
const vertices = rings.flat()
export const CARABAYLLO_BOUNDS = {
  minLat: Math.min(...vertices.map(p => p[1])), maxLat: Math.max(...vertices.map(p => p[1])),
  minLng: Math.min(...vertices.map(p => p[0])), maxLng: Math.max(...vertices.map(p => p[0])),
}

export function isValidPoint(point) {
  return !!point && typeof point.lat === 'number' && typeof point.lng === 'number' &&
    Number.isFinite(point.lat) && Math.abs(point.lat) <= 90 &&
    Number.isFinite(point.lng) && Math.abs(point.lng) <= 180
}

function insideRing({ lat: y, lng: x }, ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j]
    const cross = (x - xi) * (yj - yi) - (y - yi) * (xj - xi)
    if (Math.abs(cross) < 1e-12 && x >= Math.min(xi, xj) && x <= Math.max(xi, xj) && y >= Math.min(yi, yj) && y <= Math.max(yi, yj)) return true
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

export function isWithinCarabayllo(point) {
  return isValidPoint(point) && insideRing(point, rings[0]) && !rings.slice(1).some(ring => insideRing(point, ring))
}


/**
 * Realiza geocodificación inversa para obtener la dirección legible a partir de coordenadas en Carabayllo.
 */
export async function reverseGeocodeCarabayllo(lat, lng, signal) {
  if (!isWithinCarabayllo({ lat, lng })) return null
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
    if (addr.country_code !== 'pe' || !Object.values(addr).some(value => typeof value === 'string' && /^carabayllo$/i.test(value.trim()))) return null
    const road = addr.road || addr.pedestrian || addr.suburb || addr.neighbourhood || addr.city_district || ''
    const houseNumber = addr.house_number || ''
    const street = [road, houseNumber].filter(Boolean).join(' ')
    if (street) {
      return `${street}, Carabayllo`
    }
    const displayName = data.display_name ? data.display_name.split(',').slice(0, 2).join(',') : ''
    return displayName ? `${displayName}, Carabayllo` : null
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
    url.searchParams.set('bbox', [CARABAYLLO_BOUNDS.minLng, CARABAYLLO_BOUNDS.minLat, CARABAYLLO_BOUNDS.maxLng, CARABAYLLO_BOUNDS.maxLat].join(','))
    url.searchParams.append('layer', 'street')
    url.searchParams.append('layer', 'house')

    const res = await fetch(url, { signal, credentials: 'omit' })
    if (!res.ok) return []
    const data = await res.json()
    const results = []

    for (const feature of Array.isArray(data.features) ? data.features : []) {
      const props = feature?.properties
      const coords = feature?.geometry?.coordinates
      if (!props || !Array.isArray(coords) || !isValidPoint({ lat: coords[1], lng: coords[0] })) continue

      const point = { lat: Number(coords[1].toFixed(6)), lng: Number(coords[0].toFixed(6)) }
      if (!isWithinCarabayllo(point)) continue
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
