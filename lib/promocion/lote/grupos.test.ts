import { describe, it, expect } from 'vitest'
import { gruposDeTanda, rotuloLote } from './grupos'
import { MARCAS } from '../../datos/marcas'

const [M0, M1, M2, M3] = MARCAS.map((m) => m.id) as [string, string, string, string]
const h = (id: string, o: Record<string, unknown> = {}) => ({ id, modelo: 'TRK 502', marca_id: M3, grupo: null as number | null, variante: null as number | null, ...o })

describe('gruposDeTanda', () => {
  it('sin grupo (tanda de marcas) hay un único grupo con todas las hijas', () => {
    const r = gruposDeTanda([h('a'), h('b', { marca_id: M0 })])
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ grupo: null, modelo: 'TRK 502' })
    expect(r[0]!.hijas.map((x) => x.id)).toEqual(['a', 'b'])
  })

  it('agrupa por moto en orden de grupo, conservando el orden de las hijas', () => {
    const r = gruposDeTanda([
      h('a1', { grupo: 2, modelo: 'Leoncino', marca_id: M3 }),
      h('b1', { grupo: 1, modelo: 'TRK 502', marca_id: M3 }),
      h('a2', { grupo: 2, modelo: 'Leoncino', marca_id: M0 }),
      h('b2', { grupo: 1, modelo: 'TRK 502', marca_id: M0 }),
    ])
    expect(r.map((g) => [g.grupo, g.modelo, g.hijas.map((x) => x.id)])).toEqual([
      [1, 'TRK 502', ['b1', 'b2']],
      [2, 'Leoncino', ['a1', 'a2']],
    ])
  })

  it('una tanda sin hijas no tiene grupos', () => {
    expect(gruposDeTanda([])).toEqual([])
  })
})

describe('rotuloLote', () => {
  it('motos de una marca: "5 motos · <marca>"', () => {
    const hijas = [1, 2, 3, 4, 5].map((g) => h(`p${g}`, { grupo: g, modelo: `M${g}` }))
    expect(rotuloLote('motos', hijas)).toBe('5 motos · Benelli Store Quilmes')
  })
  it('motos de varias marcas: "4 motos × 2 marcas"', () => {
    const hijas = [1, 2, 3, 4].flatMap((g) => [M0, M3].map((m) => h(`p${g}${m}`, { grupo: g, marca_id: m })))
    expect(rotuloLote('motos', hijas)).toBe('4 motos × 2 marcas')
  })
  it('textos: "<modelo> · 3 textos"', () => {
    const hijas = [1, 2, 3].map((v) => h(`p${v}`, { variante: v }))
    expect(rotuloLote('textos', hijas)).toBe('TRK 502 · 3 textos')
  })
  it('marcas: "<modelo> · 3 marcas"', () => {
    const hijas = [M0, M1, M2].map((m) => h(m, { marca_id: m }))
    expect(rotuloLote('marcas', hijas)).toBe('TRK 502 · 3 marcas')
  })
  it('una sola moto o un solo texto va en singular', () => {
    expect(rotuloLote('motos', [h('a', { grupo: 1 })])).toBe('1 moto · Benelli Store Quilmes')
    expect(rotuloLote('textos', [h('a', { variante: 1 })])).toBe('TRK 502 · 1 texto')
  })
})
