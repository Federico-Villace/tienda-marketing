import { describe, it, expect } from 'vitest'
import { costoAproximadoCambioTexto } from './costos.ts'

describe('costoAproximadoCambioTexto', () => {
  it('~US$ 0,001 con gpt-6-luna (2.500 in, 1.500 out)', () => {
    expect(costoAproximadoCambioTexto('gpt-6-luna')).toBeCloseTo(0.001, 6)
  })
  it('modelo sin precio: null', () => expect(costoAproximadoCambioTexto('x')).toBeNull())
})
