import { describe, it, expect } from 'vitest'
import { MARCAS, cuentasDeMarca, marcaPorId, normalizarTexto, ordenarMarcas, rotuloMarcas, tokenDeMarca } from './marcas'

const ids = MARCAS.map((m) => m.id)

describe('normalizarTexto', () => {
  it('minúsculas, sin tildes y solo [a-z0-9]', () => {
    expect(normalizarTexto('Promo Ñandú — Zóntes #1!')).toBe('promonanduzontes1')
  })
})

describe('tokenDeMarca / cuentasDeMarca / marcaPorId', () => {
  it('el token es el nombre sin "Quilmes" ni "Store", normalizado', () => {
    expect(MARCAS.map(tokenDeMarca)).toEqual(['999motos', 'motoplex', 'suzuki', 'benelli', 'qjmotor', 'zontes', 'motomorini'])
  })
  it('las cuentas son la página y el Instagram de ESA marca', () => {
    expect(cuentasDeMarca(MARCAS[3]!)).toEqual([MARCAS[3]!.id, MARCAS[3]!.igId])
  })
  it('marcaPorId encuentra o devuelve undefined', () => {
    expect(marcaPorId(ids[1]!)?.nombre).toBe('Motoplex Quilmes')
    expect(marcaPorId('nope')).toBeUndefined()
  })
})

describe('ordenarMarcas', () => {
  it('ordena según MARCAS, sin duplicados y descartando desconocidas', () => {
    expect(ordenarMarcas([ids[5]!, 'x', ids[2]!, ids[5]!])).toEqual([ids[2], ids[5]])
  })
  it('vacío si no queda ninguna válida', () => {
    expect(ordenarMarcas(['x'])).toEqual([])
  })
})

describe('rotuloMarcas', () => {
  it('1 marca: su nombre', () => {
    expect(rotuloMarcas([ids[2]!])).toBe('Suzuki Quilmes')
  })
  it('2 y 3: lista con "y"', () => {
    expect(rotuloMarcas([ids[2]!, ids[5]!])).toBe('Suzuki Quilmes y Zontes Quilmes')
    expect(rotuloMarcas([ids[2]!, ids[3]!, ids[5]!])).toBe('Suzuki Quilmes, Benelli Store Quilmes y Zontes Quilmes')
  })
  it('más de 3: cantidad; las 7: "Todas las marcas"', () => {
    expect(rotuloMarcas(ids.slice(0, 4))).toBe('4 marcas')
    expect(rotuloMarcas(ids)).toBe('Todas las marcas')
  })
  it('sin marcas válidas: guion', () => {
    expect(rotuloMarcas([])).toBe('—')
  })
})
