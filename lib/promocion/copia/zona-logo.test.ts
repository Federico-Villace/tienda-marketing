import { describe, it, expect } from 'vitest'
import { zonaLogo, ZONA_LOGO_POR_DEFECTO } from './zona-logo'

describe('zonaLogo', () => {
  it('sin caja: arriba al centro', () => {
    expect(ZONA_LOGO_POR_DEFECTO).toEqual({ x: 0.3, y: 0.02, w: 0.4, h: 0.08 })
    expect(zonaLogo(null)).toEqual({ caja: ZONA_LOGO_POR_DEFECTO, porDefecto: true })
  })
  it('una caja razonable se usa tal cual', () => {
    const c = { x: 0.05, y: 0.03, w: 0.3, h: 0.1 }
    expect(zonaLogo(c)).toEqual({ caja: c, porDefecto: false })
  })
  it('muy chica o muy grande: la de por defecto', () => {
    for (const c of [{ x: 0.1, y: 0.1, w: 0.05, h: 0.1 }, { x: 0.1, y: 0.1, w: 0.7, h: 0.1 }, { x: 0.1, y: 0.1, w: 0.3, h: 0.02 }, { x: 0.1, y: 0.1, w: 0.3, h: 0.25 }]) {
      expect(zonaLogo(c).porDefecto, JSON.stringify(c)).toBe(true)
    }
  })
  it('los límites exactos valen', () => {
    expect(zonaLogo({ x: 0, y: 0, w: 0.08, h: 0.03 }).porDefecto).toBe(false)
    expect(zonaLogo({ x: 0.4, y: 0.8, w: 0.6, h: 0.2 }).porDefecto).toBe(false)
  })
  it('se pasa del lienzo: se acota; si al acotar deja de servir, la de por defecto', () => {
    expect(zonaLogo({ x: 0.8, y: 0.1, w: 0.3, h: 0.1 })).toEqual({ caja: { x: 0.8, y: 0.1, w: 0.2, h: 0.1 }, porDefecto: false })
    expect(zonaLogo({ x: 0.97, y: 0.1, w: 0.3, h: 0.1 }).porDefecto).toBe(true)
    expect(zonaLogo({ x: -0.2, y: 0.1, w: 0.3, h: 0.1 })).toEqual({ caja: { x: 0, y: 0.1, w: 0.1, h: 0.1 }, porDefecto: false })
  })
  it('números raros: la de por defecto', () => {
    expect(zonaLogo({ x: Number.NaN, y: 0, w: 0.3, h: 0.1 }).porDefecto).toBe(true)
  })
})
