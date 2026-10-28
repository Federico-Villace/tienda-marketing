import { describe, it, expect } from 'vitest'
import { LIMITES_LOTE, esTipoTanda } from './tipos'

describe('tipos de lote', () => {
  it('los límites del diseño', () => {
    expect(LIMITES_LOTE).toMatchObject({ MOTOS_MIN: 2, MOTOS: 10, MARCAS: 7, PLACAS: 14, TEXTOS_MIN: 2, TEXTOS: 5, VARIANTES_IMAGEN: 2 })
  })
  it('esTipoTanda', () => {
    for (const t of ['marcas', 'motos', 'textos']) expect(esTipoTanda(t)).toBe(true)
    for (const t of ['grilla', '', null, undefined, 3]) expect(esTipoTanda(t)).toBe(false)
  })
})
