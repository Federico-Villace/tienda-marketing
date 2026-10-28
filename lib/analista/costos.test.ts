import { describe, expect, it } from 'vitest'
import { costoAproximadoAnalisis, costoAproximadoPregunta, formatearCostoAproximado } from './costos'

describe('costos del Analista (lo que dice el botón antes del click)', () => {
  it('el análisis v4 ronda US$ 0,003 con gpt-6-luna', () => {
    const c = costoAproximadoAnalisis('gpt-6-luna')!
    expect(c).toBeCloseTo(0.00285, 5)
    expect(formatearCostoAproximado(c)).toBe('~US$ 0,003')
  })

  it('una pregunta ronda US$ 0,001, sin suponer caché', () => {
    expect(formatearCostoAproximado(costoAproximadoPregunta('gpt-6-luna'))).toBe('~US$ 0,001')
  })

  it('un modelo sin precio no inventa un costo: null y texto vacío', () => {
    expect(costoAproximadoAnalisis('modelo-raro')).toBeNull()
    expect(formatearCostoAproximado(null)).toBe('')
  })
})
