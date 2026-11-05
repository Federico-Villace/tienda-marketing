import { describe, it, expect } from 'vitest'
import { formatearUsdCorto, formatearUsdExacto } from './formato'

describe('formatearUsdCorto · real', () => {
  it('cero es "US$ 0"', () => expect(formatearUsdCorto(0)).toBe('US$ 0'))
  it('menos de un centavo no se muestra como 0,00', () => expect(formatearUsdCorto(0.004)).toBe('menos de US$ 0,01'))
  it('redondea normal a 2 decimales', () => {
    expect(formatearUsdCorto(0.044)).toBe('US$ 0,04')
    expect(formatearUsdCorto(12.3456)).toBe('US$ 12,35')
  })
})

describe('formatearUsdCorto · estimado (nunca muestra menos de lo que puede costar)', () => {
  it('redondea hacia arriba', () => {
    expect(formatearUsdCorto(0.041, { estimado: true })).toBe('~US$ 0,05')
    expect(formatearUsdCorto(0.0001, { estimado: true })).toBe('~US$ 0,01')
  })
  it('un valor exacto en centavos no sube por error de coma flotante', () => {
    for (const c of [0.04, 0.07, 0.29, 1.1, 0.58]) {
      expect(formatearUsdCorto(c, { estimado: true })).toBe(`~US$ ${c.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`)
    }
  })
  it('cero estimado sigue siendo "US$ 0"', () => expect(formatearUsdCorto(0, { estimado: true })).toBe('US$ 0'))
  it('nunca muestra menos que el valor', () => {
    for (const n of [0.0021, 0.0449, 0.1234, 3.001]) {
      const mostrado = Number(formatearUsdCorto(n, { estimado: true }).replace(/[^\d,]/g, '').replace(',', '.'))
      expect(mostrado).toBeGreaterThanOrEqual(n)
    }
  })
})

describe('formatearUsdExacto', () => {
  it('conserva 4 a 6 decimales para el detalle', () => {
    expect(formatearUsdExacto(0.0448)).toBe('US$ 0,0448')
    expect(formatearUsdExacto(0)).toBe('US$ 0,0000')
  })
})
