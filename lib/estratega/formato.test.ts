import { describe, it, expect } from 'vitest'
import { formatearArs, formatearUsd } from './formato'

describe('formato', () => {
  it('USD con coma y al menos 4 decimales: un plan cuesta centavos', () => {
    expect(formatearUsd(0.0021)).toBe('US$ 0,0021')
    expect(formatearUsd(0)).toBe('US$ 0,0000')
  })

  it('ARS entero con separador de miles es-AR', () => {
    expect(formatearArs(300000)).toBe('ARS 300.000')
    expect(formatearArs(1500000)).toBe('ARS 1.500.000')
  })
})
