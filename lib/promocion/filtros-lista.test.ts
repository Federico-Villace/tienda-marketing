import { describe, it, expect } from 'vitest'
import { filtrarLista, parsearFiltrosLista } from './filtros-lista'
import { MARCAS } from '../datos/marcas'

const item = (marcaId: string, modelo: string) => ({ id: `${marcaId}-${modelo}`, marcaId, modelo }) as never

describe('parsearFiltrosLista', () => {
  it('sin parámetros no filtra: todas las marcas y sin modelo', () => {
    expect(parsearFiltrosLista({})).toEqual({ marcaIds: MARCAS.map((m) => m.id), modelo: '' })
  })
  it('lee `marca` (repetido o todas) y `modelo`; acepta el `comparar` viejo', () => {
    expect(parsearFiltrosLista({ marca: [MARCAS[2]!.id, MARCAS[0]!.id], modelo: ' TRK ' })).toEqual({ marcaIds: [MARCAS[0]!.id, MARCAS[2]!.id], modelo: 'TRK' })
    expect(parsearFiltrosLista({ comparar: MARCAS[4]!.id }).marcaIds).toEqual([MARCAS[4]!.id])
    expect(parsearFiltrosLista({ marca: 'inventada' }).marcaIds).toHaveLength(MARCAS.length)
  })
  it('el modelo toma el primero si viene repetido y se recorta', () => {
    expect(parsearFiltrosLista({ modelo: ['a', 'b'] }).modelo).toBe('a')
    expect(parsearFiltrosLista({ modelo: 'x'.repeat(200) }).modelo).toHaveLength(60)
  })
})

describe('filtrarLista', () => {
  const a = item(MARCAS[0]!.id, 'TRK 502')
  const b = item(MARCAS[1]!.id, 'Rouser 200')
  const c = item(MARCAS[1]!.id, 'TRK 502 X')
  const f = parsearFiltrosLista({})
  it('por marca', () => {
    expect(filtrarLista([a, b, c], { ...f, marcaIds: [MARCAS[1]!.id] })).toEqual([b, c])
  })
  it('por modelo: contiene, sin mayúsculas ni tildes ni espacios', () => {
    expect(filtrarLista([a, b, c], { ...f, modelo: 'trk502' })).toEqual([a, c])
    expect(filtrarLista([a, b, c], { ...f, modelo: 'ROUSER' })).toEqual([b])
  })
  it('las dos juntas', () => {
    expect(filtrarLista([a, b, c], { marcaIds: [MARCAS[1]!.id], modelo: 'trk' })).toEqual([c])
  })
})
