import { describe, expect, it } from 'vitest'
import { armarHechos, indiceHechos, MAX_HECHOS } from './hechos'
import { armarEntrada } from './entrada'
import { campania, entradaDePrueba, filtrosZontes, post } from './fixture.test-util'
import { MARCAS } from '../datos/marcas'

describe('armarHechos', () => {
  it('es determinista: los mismos datos dan los mismos hechos con los mismos ids', () => {
    expect(entradaDePrueba().hechos).toEqual(entradaDePrueba().hechos)
  })

  it('ids h1, h2, ... únicos, y nunca más de 90', () => {
    const e = entradaDePrueba()
    expect(e.hechos[0]!.id).toBe('h1')
    expect(new Set(e.hechos.map((h) => h.id)).size).toBe(e.hechos.length)
    const muchas = armarEntrada({
      filtros: { ...filtrosZontes, marcaIds: MARCAS.map((m) => m.id) },
      publicaciones: MARCAS.flatMap((m) => Array.from({ length: 6 }, () => post({ marcaId: m.id }))),
      campanias: Array.from({ length: 30 }, () => campania({ nombre: 'Zontes x' })),
      mensajes: [],
    })
    expect(muchas.hechos.length).toBeLessThanOrEqual(MAX_HECHOS)
  })

  it('el valor de cada hecho sale del payload (no inventa cifras): vistas totales = resumen', () => {
    const e = entradaDePrueba()
    const vistas = e.hechos.find((h) => h.que === 'Vistas totales')!
    expect(vistas.valor).toBe(e.organico.resumen.vistas)
    expect(vistas.muestra).toEqual({ cantidad: 11, unidad: 'publicaciones' })
  })

  it('un dato que Meta no informa (null) no genera hecho', () => {
    const e = entradaDePrueba()
    expect(e.hechos.some((h) => h.que.startsWith('Alcance total'))).toBe(false)
  })

  it('incluye los destacados con su muestra', () => {
    const e = entradaDePrueba()
    const mejor = e.hechos.find((h) => h.que.startsWith('Mejor campaña'))!
    expect(mejor.unidad).toBe('ARS')
    expect(mejor.muestra!.unidad).toBe('resultados')
    expect(e.hechos.some((h) => h.que.startsWith('Mejor publicación'))).toBe(true)
  })

  it('armarHechos(entrada sin hechos) coincide con los que trae la entrada', () => {
    const { hechos, ...sinHechos } = entradaDePrueba()
    expect(armarHechos(sinHechos)).toEqual(hechos)
    expect(indiceHechos(hechos).get('h1')).toBe(hechos[0])
  })

  it('no lleva ids de Meta ni permalinks', () => {
    const json = JSON.stringify(entradaDePrueba().hechos)
    expect(json).not.toMatch(/instagram\.com|perma|id-post|id-camp|cuenta-secreta/)
  })
})
