import { describe, it, expect } from 'vitest'
import { mascarasEscena } from './comun'

describe('mascarasEscena (la escena se funde por los cuatro bordes)', () => {
  const m = mascarasEscena(0.08, 0.16, 0.2)
  it('cada eje arranca y termina TRANSPARENTE: no queda ningún borde con filo', () => {
    for (const g of [m.horizontal, m.vertical]) {
      expect(g.startsWith('linear-gradient(')).toBe(true)
      expect(g).toMatch(/rgba\(0,0,0,0\) 0%/)
      expect(g).toMatch(/rgba\(0,0,0,0\) 100%\)$/)
    }
  })
  it('el centro es opaco y las franjas de fundido salen de los parámetros', () => {
    expect(m.horizontal).toContain('#000 8%, #000 92%')
    expect(m.vertical).toContain('#000 16%, #000 80%')
  })
})
