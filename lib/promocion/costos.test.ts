import { describe, it, expect } from 'vitest'
import { costoAproximadoAntecedentes, costoAproximadoTextos, costoLoteImagenes, costoLote, formatearCostoAproximado, formatearCostoLote } from './costos'

describe('costos aproximados (lo que dice el botón antes del click)', () => {
  it('antecedentes: centésimas de centavo, del orden de US$ 0,002', () => {
    const c = costoAproximadoAntecedentes('gpt-6-luna')
    expect(c).toBeGreaterThan(0.0005)
    expect(c).toBeLessThan(0.005)
  })
  it('textos: del orden de US$ 0,003', () => {
    const c = costoAproximadoTextos('gpt-6-luna')
    expect(c).toBeGreaterThan(0.0005)
    expect(c).toBeLessThan(0.006)
  })
  it('un modelo sin precio no inventa un costo', () => {
    expect(costoAproximadoTextos('modelo-raro')).toBeNull()
    expect(costoAproximadoAntecedentes('modelo-raro')).toBeNull()
  })
  it('se dice con "~" y tres decimales', () => {
    expect(formatearCostoAproximado(0.0021)).toBe('~US$ 0,002')
    expect(formatearCostoAproximado(0.0029)).toBe('~US$ 0,003')
    expect(formatearCostoAproximado(null)).toBe('')
  })
})

describe('costo de un lote (un click, N llamadas)', () => {
  it('el total es N × el unitario', () => {
    expect(costoLote(0.002, 7)).toBeCloseTo(0.014, 6)
    expect(costoLote(null, 3)).toBeNull()
  })
  it('se dice el total y la cuenta, para que el click muestre el precio entero', () => {
    expect(formatearCostoLote(0.002, 7)).toBe('~US$ 0,014 (7 × ~US$ 0,002)')
  })
  it('con una sola llamada es el costo común', () => {
    expect(formatearCostoLote(0.0021, 1)).toBe('~US$ 0,002')
  })
  it('sin precio unitario no inventa nada', () => {
    expect(formatearCostoLote(null, 3)).toBe('')
  })
})

describe('costoLoteImagenes', () => {
  it('5 motos × 1 variante: 5 imágenes al tope de Nano Banana 2.1 (~US$ 0,23)', () => {
    const c = costoLoteImagenes('gemini-nano-banana-2.1', 5, 1)
    expect(c.imagenes).toBe(5)
    expect(c.porMotoUsd).toBeCloseTo(0.045028, 5)
    expect(c.topeTotalUsd).toBeCloseTo(0.22514, 4)
    expect(c.totalListaUsd).toBeCloseTo(0.168, 5)
  })
  it('10 motos × 2 variantes: 20 imágenes (~US$ 0,90 al tope)', () => {
    const c = costoLoteImagenes('gemini-nano-banana-2.1', 10, 2)
    expect(c.imagenes).toBe(20)
    expect(c.topeTotalUsd).toBeCloseTo(0.90056, 4)
  })
  it('con foto de inspiración cada imagen cuesta algo más', () => {
    const sin = costoLoteImagenes('gemini-nano-banana-2.1', 4, 1)
    const con = costoLoteImagenes('gemini-nano-banana-2.1', 4, 1, { conReferencia: true })
    expect(con.topeTotalUsd).toBeGreaterThan(sin.topeTotalUsd)
  })
  it('un motor sin precio no se calcula (regla #3)', () => {
    expect(() => costoLoteImagenes('inventado', 2, 1)).toThrow()
  })
})
