import { describe, it, expect } from 'vitest'
import { armarEntradaPromocion, hashEntradaPromocion } from './entrada'
import type { ResumenPromocion } from '../../datos/promocion'
import { datosDePrueba } from '../fixture'

const resumen = (o: Partial<ResumenPromocion> = {}): ResumenPromocion => ({
  modeloFiltrable: true,
  publicaciones: 12,
  organico: [
    { mencionaModelo: true, plataforma: 'instagram', tipo: 'REELS', publicaciones: 3, vistas: 1500, interaccionesPromedio: 40.456, comentariosPromedio: 2, tasaInteraccion: 0.08123 },
    { mencionaModelo: false, plataforma: 'facebook', tipo: 'IMAGE', publicaciones: 9, vistas: 3000, interaccionesPromedio: 10, comentariosPromedio: 1, tasaInteraccion: null },
  ],
  porPromo: [{ promo: 'cuotas', publicaciones: 4, vistas: 2000, interaccionesPromedio: 30, tasaInteraccion: 0.06 }],
  mejores: [{ fecha: '2026-10-03', plataforma: 'instagram', tipo: 'REELS', mencionaModelo: true, texto: 'x'.repeat(300), vistas: 900, interacciones: 80 }],
  campanias: {
    totales: { campanias: 1, gasto: 1500.5, impresiones: 10000, clics: 100, resultados: 10 },
    top: [{ nombre: 'Benelli TRK 502 tráfico', mencionaModelo: true, gasto: 1500.5, impresiones: 10000, clics: 100, resultados: 10 }],
  },
  ...o,
})
const periodo = { desde: '2026-07-28', hasta: '2026-10-25' }
const armar = (r = resumen()) => armarEntradaPromocion(r, { marca: 'Benelli Store Quilmes', modelo: 'TRK 502', datos: datosDePrueba(), periodo })

describe('armarEntradaPromocion (regla #2: solo agregados)', () => {
  it('describe la promoción sin el precio', () => {
    const e = armar()
    expect(e.promocion).toEqual({ marca: 'Benelli Store Quilmes', modelo: 'TRK 502', tipoPromo: 'cuotas', detallePromo: '12 cuotas sin interés' })
    expect(JSON.stringify(e)).not.toContain('4500000')
  })
  it('el período lleva los días', () => {
    expect(armar().periodo).toEqual({ desde: '2026-07-28', hasta: '2026-10-25', dias: 90 })
  })
  it('redondea y copia campo a campo; la tasa pasa a porcentaje', () => {
    const e = armar()
    expect(e.organico[0]).toEqual({
      mencionaModelo: true,
      plataforma: 'instagram',
      tipo: 'REELS',
      publicaciones: 3,
      vistas: 1500,
      interaccionesPromedio: 40.46,
      comentariosPromedio: 2,
      tasaInteraccionPct: 8.12,
    })
    expect(e.organico[1]!.tasaInteraccionPct).toBeNull()
  })
  it('los textos de los mejores posts se recortan a 140', () => {
    expect(armar().mejores[0]!.texto).toHaveLength(140)
  })
  it('campañas: totales y top, con el CTR calculado', () => {
    const c = armar().campanias
    expect(c.totales).toEqual({ campanias: 1, gasto: 1500.5, impresiones: 10000, clics: 100, resultados: 10, ctrPct: 1 })
    expect(c.top[0]).toMatchObject({ nombre: 'Benelli TRK 502 tráfico', mencionaModelo: true, costoPorResultado: 150.05 })
  })
  it('nada de ids, permalinks ni claves internas: ni siquiera si la RPC los devolviera', () => {
    const sucio = resumen({
      mejores: [{ fecha: 'f', plataforma: 'p', tipo: 't', mencionaModelo: false, texto: 'x', vistas: 1, interacciones: 1, id: 'ID-SECRETO', permalink: 'https://instagram.com/p/SECRETO' } as never],
    })
    const json = JSON.stringify(armar(sucio))
    expect(json).not.toMatch(/ID-SECRETO|SECRETO|permalink|"id"/)
  })
  it('avisa cuando no se pudo filtrar por modelo', () => {
    const e = armar(resumen({ modeloFiltrable: false }))
    expect(e.notas.join(' ')).toMatch(/modelo/i)
    expect(e.modeloFiltrable).toBe(false)
  })
  it('avisa que las campañas se atribuyen por nombre', () => {
    expect(armar().notas.join(' ')).toMatch(/nombre/i)
  })
  it('sin campañas lo dice con ceros, no con null', () => {
    const e = armar(resumen({ campanias: { totales: { campanias: 0, gasto: 0, impresiones: 0, clics: 0, resultados: 0 }, top: [] } }))
    expect(e.campanias.totales.ctrPct).toBe(0)
    expect(e.campanias.top).toEqual([])
  })
})

describe('hashEntradaPromocion', () => {
  const entrada = armar()
  it('es estable para la misma entrada', () => {
    expect(hashEntradaPromocion({ organizacionId: 'o', entrada, modelo: 'm' })).toBe(hashEntradaPromocion({ organizacionId: 'o', entrada: armar(), modelo: 'm' }))
  })
  it('cambia con el modelo de IA, la organización, la entrada y la versión del prompt', () => {
    const base = hashEntradaPromocion({ organizacionId: 'o', entrada, modelo: 'm' })
    expect(hashEntradaPromocion({ organizacionId: 'o', entrada, modelo: 'otro' })).not.toBe(base)
    expect(hashEntradaPromocion({ organizacionId: 'x', entrada, modelo: 'm' })).not.toBe(base)
    expect(hashEntradaPromocion({ organizacionId: 'o', entrada: armar(resumen({ publicaciones: 99 })), modelo: 'm' })).not.toBe(base)
  })
})

describe('armarEntradaPromocion · comparación entre marcas (v2)', () => {
  const fila = (o: Record<string, unknown> = {}) => ({
    marca: 'Zontes Quilmes',
    modelo: 'TRK 502',
    publicaciones: 4,
    vistasPromedio: 400.456,
    tasaInteraccionPct: 7.5,
    mencionanModelo: 1,
    gastoAtribuido: 100.123,
    ...o,
  })
  const conComparacion = (comparacion: unknown[]) =>
    armarEntradaPromocion(resumen(), { marca: 'Benelli Store Quilmes', modelo: 'TRK 502', datos: datosDePrueba(), periodo, comparacion: comparacion as never })

  it('sin comparación no hay clave: la entrada de una promoción suelta no cambia', () => {
    expect(armar()).not.toHaveProperty('comparacion')
    expect(conComparacion([])).not.toHaveProperty('comparacion')
  })
  it('copia campo a campo y redondea', () => {
    expect(conComparacion([fila()]).comparacion).toEqual([
      { marca: 'Zontes Quilmes', modelo: 'TRK 502', publicaciones: 4, vistasPromedio: 400.46, tasaInteraccionPct: 7.5, mencionanModelo: 1, gastoAtribuido: 100.12 },
    ])
  })
  it('no deja pasar campos de más (ids, permalinks) ni más de 21 filas', () => {
    const e = conComparacion(Array.from({ length: 30 }, () => fila({ marcaId: 'ID-SECRETO', permalink: 'https://x/SECRETO' })))
    expect(e.comparacion).toHaveLength(21)
    expect(JSON.stringify(e)).not.toMatch(/SECRETO|marcaId/)
  })
  it('la comparación entra al hash: otra comparación es otro análisis', () => {
    const h = (e: ReturnType<typeof conComparacion>) => hashEntradaPromocion({ organizacionId: 'o', entrada: e, modelo: 'm' })
    expect(h(conComparacion([fila()]))).not.toBe(h(armar()))
    expect(h(conComparacion([fila()]))).not.toBe(h(conComparacion([fila({ publicaciones: 5 })])))
  })
})
