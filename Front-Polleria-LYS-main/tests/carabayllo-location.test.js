import { describe, expect, test } from 'vitest'
import {
  CARABAYLLO_CENTER,
  isWithinCarabayllo,
  isValidPoint,
  searchCarabaylloAddresses,
} from '../src/utils/carabaylloLocation'

describe('Utilidades de ubicación para el distrito de Carabayllo', () => {
  test('CARABAYLLO_CENTER está dentro de las coordenadas de Lima Norte', () => {
    expect(CARABAYLLO_CENTER[0]).toBeCloseTo(-11.8784, 2)
    expect(CARABAYLLO_CENTER[1]).toBeCloseTo(-77.0342, 2)
  })

  test('isWithinCarabayllo identifica correctamente puntos dentro y fuera del distrito', () => {
    // Plaza de Armas de Carabayllo / San Pedro
    expect(isWithinCarabayllo({ lat: -11.8784, lng: -77.0342 })).toBe(true)
    // Av. Túpac Amaru km 20 (Carabayllo)
    expect(isWithinCarabayllo({ lat: -11.8900, lng: -77.0380 })).toBe(true)
    // Santa Isabel / Enace (Carabayllo)
    expect(isWithinCarabayllo({ lat: -11.8650, lng: -77.0250 })).toBe(true)

    // Puntos claramente fuera del distrito de Carabayllo:
    // Miraflores
    expect(isWithinCarabayllo({ lat: -12.1200, lng: -77.0280 })).toBe(false)
    // Centro de Lima
    expect(isWithinCarabayllo({ lat: -12.0463, lng: -77.0427 })).toBe(false)
    // Huánuco
    expect(isWithinCarabayllo({ lat: -9.9300, lng: -76.2400 })).toBe(false)
    // Coordenadas nulas o inválidas
    expect(isWithinCarabayllo(null)).toBe(false)
    expect(isWithinCarabayllo({})).toBe(false)
    expect(isWithinCarabayllo({ lat: 'abc', lng: 'xyz' })).toBe(false)
  })

  test('isValidPoint valida formato numérico de latitud y longitud', () => {
    expect(isValidPoint({ lat: -11.8784, lng: -77.0342 })).toBe(true)
    expect(isValidPoint({ lat: 0, lng: 0 })).toBe(true)
    expect(isValidPoint(null)).toBe(false)
    expect(isValidPoint({ lat: 95, lng: 0 })).toBe(false)
    expect(isValidPoint({ lat: -11, lng: 200 })).toBe(false)
  })

  test('searchCarabaylloAddresses rechaza búsquedas menores a 3 letras', async () => {
    expect(await searchCarabaylloAddresses('')).toEqual([])
    expect(await searchCarabaylloAddresses('  ')).toEqual([])
    expect(await searchCarabaylloAddresses('av')).toEqual([])
  })
})


test('rechaza puntos del antiguo rectángulo que no pertenecen al distrito y tipos falsificados', () => {
  expect(isWithinCarabayllo({ lat: -11.94, lng: -77.08 })).toBe(false)
  expect(isWithinCarabayllo({ lat: '-11.88', lng: '-77.03' })).toBe(false)
  expect(isValidPoint({ lat: null, lng: '' })).toBe(false)
})
