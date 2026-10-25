import { describe, it, expect } from 'vitest'
import { cuentasDeMarca, marcaPorId, tokenDeMarca } from './marca'
import { MARCAS } from '../datos/marcas'

describe('tokenDeMarca', () => {
  it('es el nombre en minúsculas, sin "Quilmes" ni "Store" ni espacios', () => {
    const tokens = MARCAS.map((m) => tokenDeMarca(m))
    expect(tokens).toEqual(['999motos', 'motoplex', 'suzuki', 'benelli', 'qjmotor', 'zontes', 'motomorini'])
  })
})

describe('cuentasDeMarca', () => {
  it('son la página de Facebook y la cuenta de Instagram de ESA marca', () => {
    const m = MARCAS[3]!
    expect(cuentasDeMarca(m)).toEqual([m.id, m.igId])
  })
})

describe('marcaPorId', () => {
  it('encuentra la marca o devuelve undefined', () => {
    expect(marcaPorId(MARCAS[1]!.id)?.nombre).toBe('Motoplex Quilmes')
    expect(marcaPorId('nope')).toBeUndefined()
  })
})
