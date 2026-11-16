import { describe, it, expect } from 'vitest'
import { colorLegible, luminancia, mezclar, ratioContraste, NEGRO_LEGIBLE, BLANCO_LEGIBLE } from './contraste'

describe('ratioContraste (WCAG)', () => {
  it('blanco sobre negro es 21 y es simétrico', () => {
    expect(ratioContraste('#FFFFFF', '#000000')).toBeCloseTo(21, 5)
    expect(ratioContraste('#000000', '#FFFFFF')).toBeCloseTo(21, 5)
  })
  it('un color contra sí mismo es 1', () => {
    expect(ratioContraste('#2F6BFF', '#2F6BFF')).toBeCloseTo(1, 5)
  })
  it('valores conocidos', () => {
    expect(ratioContraste('#777777', '#FFFFFF')).toBeCloseTo(4.48, 1)
    expect(luminancia('#FF0000')).toBeCloseTo(0.2126, 4)
  })
})

describe('colorLegible', () => {
  it('conserva el color si ya contrasta lo pedido', () => {
    expect(colorLegible('#FFFFFF', '#0B0B0D', 3)).toBe('#FFFFFF')
  })
  it('sobre fondo oscuro con texto oscuro elige blanco', () => {
    expect(colorLegible('#222222', '#0B0B0D', 3)).toBe(BLANCO_LEGIBLE)
  })
  it('sobre fondo claro con texto claro elige el negro de la marca', () => {
    expect(colorLegible('#EEEEEE', '#F3EBDD', 4.5)).toBe(NEGRO_LEGIBLE)
  })
  it('elige el que MÁS contraste cuando el fondo es intermedio', () => {
    const fondo = '#1530C8' // azul oscuro: gana el blanco
    expect(colorLegible('#1A35D0', fondo, 4.5)).toBe(BLANCO_LEGIBLE)
    const claro = '#E4FF1A' // amarillo flúor: gana el negro
    expect(colorLegible('#FFFF00', claro, 4.5)).toBe(NEGRO_LEGIBLE)
  })
  it('siempre devuelve algo que llega al mínimo cuando es alcanzable', () => {
    for (const fondo of ['#000000', '#FFFFFF', '#808080', '#FF0000', '#00FF00', '#0000FF', '#F3EBDD', '#1530C8']) {
      const c = colorLegible(fondo, fondo, 3)
      expect(ratioContraste(c, fondo), fondo).toBeGreaterThanOrEqual(3)
    }
  })
})

describe('mezclar', () => {
  it('t=0 y t=1 son los extremos y 0.5 el medio', () => {
    expect(mezclar('#000000', '#FFFFFF', 0)).toBe('#000000')
    expect(mezclar('#000000', '#FFFFFF', 1)).toBe('#FFFFFF')
    expect(mezclar('#000000', '#FFFFFF', 0.5)).toBe('#808080')
  })
})
