import { describe, it, expect } from 'vitest'
import { costoAproximadoAntecedentes, costoAproximadoTextos, formatearCostoAproximado } from './costos'

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
