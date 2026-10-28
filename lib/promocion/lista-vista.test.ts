import { describe, it, expect } from 'vitest'
import { armarVista, fechaRelativa, parsearVista, POR_PAGINA, urlLista } from './lista-vista'
import type { ItemLista } from './pantalla'
import { MARCAS } from '../datos/marcas'

const TODAS = MARCAS.map((m) => m.id)
const filtros = { marcaIds: TODAS, modelo: '' }
const item = (o: Partial<ItemLista> = {}): ItemLista => ({
  id: 'p', estado: 'borrador', marcaId: TODAS[0]!, marca: 'M', modelo: 'TRK 502', precio: '$ 1', pasoActual: 3,
  tandaId: null, tipoTanda: null, grupo: null, variante: null, actualizadoEn: '2026-10-25T15:00:00+00:00', miniatura: null, descarga: null, ...o,
})
const lista = (o: Partial<{ borradores: ItemLista[]; aprobadas: ItemLista[]; descartadas: ItemLista[] }> = {}) => ({ borradores: [], aprobadas: [], descartadas: [], ...o })

describe('parsearVista', () => {
  it('por defecto: "Para terminar" y página 1; lo inválido vuelve al default', () => {
    expect(parsearVista({})).toEqual({ ver: 'terminar', pagina: 1 })
    expect(parsearVista({ ver: 'historial', pagina: '3' })).toEqual({ ver: 'historial', pagina: 3 })
    expect(parsearVista({ ver: 'hack', pagina: '-2' })).toEqual({ ver: 'terminar', pagina: 1 })
    expect(parsearVista({ ver: ['descartadas'], pagina: 'abc' })).toEqual({ ver: 'descartadas', pagina: 1 })
  })
})

describe('armarVista · pestañas y totales', () => {
  it('separa para terminar, historial y descartadas, con sus totales', () => {
    const l = lista({ borradores: [item({ id: 'a' })], aprobadas: [item({ id: 'b', estado: 'aprobada' }), item({ id: 'c', estado: 'aprobada' })], descartadas: [item({ id: 'd', estado: 'descartada' })] })
    const v = armarVista(l, filtros, 'terminar', 1)
    expect(v.totales).toEqual({ terminar: 1, historial: 2, descartadas: 1 })
    expect(v.entradas.map((e) => (e.tipo === 'suelta' ? e.item.id : e.id))).toEqual(['a'])
    expect(armarVista(l, filtros, 'historial', 1).entradas).toHaveLength(2)
    expect(armarVista(l, filtros, 'descartadas', 1).entradas).toHaveLength(1)
  })
  it('una tanda cuenta UNA vez; con alguna hija en borrador va a "Para terminar", si no al historial', () => {
    const mixta = lista({ borradores: [item({ id: 'h1', tandaId: 'T' })], aprobadas: [item({ id: 'h2', tandaId: 'T', estado: 'aprobada' }), item({ id: 'h3', tandaId: 'T', estado: 'aprobada' })] })
    const v = armarVista(mixta, filtros, 'terminar', 1)
    expect(v.totales).toEqual({ terminar: 1, historial: 0, descartadas: 0 })
    expect(v.entradas[0]).toMatchObject({ tipo: 'tanda', id: 'T' })
    expect((v.entradas[0] as { items: unknown[] }).items).toHaveLength(3)
    const cerrada = lista({ aprobadas: [item({ id: 'h2', tandaId: 'T', estado: 'aprobada' }), item({ id: 'h3', tandaId: 'T', estado: 'aprobada' })] })
    expect(armarVista(cerrada, filtros, 'historial', 1).totales).toEqual({ terminar: 0, historial: 1, descartadas: 0 })
  })
  it('ordena por actualización más reciente (una tanda por su hija más reciente)', () => {
    const l = lista({
      borradores: [
        item({ id: 'vieja', actualizadoEn: '2026-10-01T00:00:00Z' }),
        item({ id: 'h1', tandaId: 'T', actualizadoEn: '2026-10-02T00:00:00Z' }),
        item({ id: 'nueva', actualizadoEn: '2026-10-10T00:00:00Z' }),
        item({ id: 'h2', tandaId: 'T', actualizadoEn: '2026-10-20T00:00:00Z' }),
      ],
    })
    const ids = armarVista(l, filtros, 'terminar', 1).entradas.map((e) => (e.tipo === 'suelta' ? e.item.id : e.id))
    expect(ids).toEqual(['T', 'nueva', 'vieja'])
  })
  it('aplica los filtros de marca y modelo (sin tildes ni espacios) a los totales también', () => {
    const l = lista({ borradores: [item({ id: 'a', modelo: 'TRK 502' }), item({ id: 'b', modelo: 'Rouser' }), item({ id: 'c', marcaId: TODAS[1]! })] })
    expect(armarVista(l, { marcaIds: [TODAS[0]!], modelo: 'trk502' }, 'terminar', 1).totales.terminar).toBe(1)
    expect(armarVista(l, { marcaIds: [TODAS[0]!], modelo: '' }, 'terminar', 1).totales.terminar).toBe(2)
  })
})

describe('armarVista · paginación', () => {
  const muchas = lista({ borradores: Array.from({ length: POR_PAGINA * 2 + 5 }, (_, i) => item({ id: `p${i}`, actualizadoEn: new Date(2026, 9, 1, 0, i).toISOString() })) })
  it('páginas de 20 entradas', () => {
    const v = armarVista(muchas, filtros, 'terminar', 1)
    expect(v.entradas).toHaveLength(POR_PAGINA)
    expect(v.paginas).toBe(3)
    expect(armarVista(muchas, filtros, 'terminar', 3).entradas).toHaveLength(5)
  })
  it('una página fuera de rango se acomoda a la última', () => {
    expect(armarVista(muchas, filtros, 'terminar', 99).pagina).toBe(3)
    expect(armarVista(lista(), filtros, 'terminar', 4)).toMatchObject({ pagina: 1, paginas: 1 })
  })
})

describe('urlLista', () => {
  it('conserva marca, modelo y pestaña; omite lo que es el default', () => {
    expect(urlLista(filtros, 'terminar', 1)).toBe('/promocionar')
    expect(urlLista({ marcaIds: [TODAS[1]!, TODAS[2]!], modelo: 'TRK 502' }, 'historial', 2)).toBe(`/promocionar?marca=${TODAS[1]}&marca=${TODAS[2]}&modelo=TRK+502&ver=historial&pagina=2`)
  })
})

describe('fechaRelativa', () => {
  const ahora = new Date('2026-10-28T12:00:00-03:00').getTime()
  it.each([
    ['2026-10-28T11:59:40-03:00', 'recién'],
    ['2026-10-28T11:55:00-03:00', 'hace 5 min'],
    ['2026-10-28T09:00:00-03:00', 'hace 3 h'],
    ['2026-10-27T10:00:00-03:00', 'ayer'],
    ['2026-10-24T10:00:00-03:00', 'hace 4 días'],
  ])('%s → %s', (iso, esperado) => {
    expect(fechaRelativa(iso, ahora)).toBe(esperado)
  })
  it('pasada una semana, la fecha corta (según el ICU puede ser "sep" o "sept")', () => {
    expect(fechaRelativa('2026-09-01T10:00:00-03:00', ahora)).toMatch(/^1 sept?$/)
  })
})

describe('armarVista · tipo y rótulo de la tanda (ADR-032)', () => {
  const h = (id: string, o: Partial<ItemLista> = {}) => item({ id, tandaId: 'T', ...o })
  const rotuloDe = (items: ItemLista[], ver: 'terminar' | 'historial' = 'terminar') => {
    const e = armarVista(lista({ borradores: items }), filtros, ver, 1).entradas[0]
    if (!e || e.tipo !== 'tanda') throw new Error('no es una tanda')
    return e
  }

  it('una tanda de marcas (o sin dato de tipo) se rotula con el modelo y las marcas', () => {
    const e = rotuloDe([h('a', { marcaId: TODAS[0]! }), h('b', { marcaId: TODAS[1]!, tipoTanda: 'marcas' }), h('c', { marcaId: TODAS[2]! })])
    expect(e.tipoTanda).toBe('marcas')
    expect(e.rotulo).toBe('TRK 502 · 3 marcas')
  })
  it('un lote de motos: "5 motos · <marca>" con una marca, "4 motos × 2 marcas" con varias', () => {
    const cinco = [1, 2, 3, 4, 5].map((g) => h(`m${g}`, { tipoTanda: 'motos', grupo: g, modelo: `M${g}`, marcaId: TODAS[3]! }))
    const e = rotuloDe(cinco)
    expect(e.tipoTanda).toBe('motos')
    expect(e.rotulo).toBe('5 motos · Benelli Store Quilmes')
    const cuatroPorDos = [1, 2, 3, 4].flatMap((g) => [TODAS[0]!, TODAS[3]!].map((m) => h(`m${g}-${m}`, { tipoTanda: 'motos', grupo: g, marcaId: m })))
    expect(rotuloDe(cuatroPorDos).rotulo).toBe('4 motos × 2 marcas')
  })
  it('un lote de textos: "<modelo> · 3 textos"', () => {
    const e = rotuloDe([1, 2, 3].map((v) => h(`t${v}`, { tipoTanda: 'textos', variante: v })))
    expect(e.tipoTanda).toBe('textos')
    expect(e.rotulo).toBe('TRK 502 · 3 textos')
  })
})
