import { describe, it, expect } from 'vitest'
import { pinceladas } from './decorados'

const numeros = (d: string) => (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number)

describe('pinceladas (decorado del diseño impactante)', () => {
  it('son deterministas: la misma semilla y el mismo lienzo dan los mismos paths', () => {
    expect(pinceladas(1080, 1350, 42)).toEqual(pinceladas(1080, 1350, 42))
  })

  it('otra semilla da otro dibujo', () => {
    expect(pinceladas(1080, 1350, 1)).not.toEqual(pinceladas(1080, 1350, 2))
  })

  it('cada formato tiene su propio dibujo: se reparte por el lienzo, no se estira', () => {
    expect(pinceladas(1080, 1350, 7)).not.toEqual(pinceladas(1080, 1920, 7))
  })

  it('devuelve varias pinceladas, cada una un path SVG cerrado con números finitos', () => {
    const p = pinceladas(1080, 1350, 9)
    expect(p.length).toBeGreaterThanOrEqual(4)
    for (const x of p) {
      expect(x.d).toMatch(/^M[\d\s.,\-LQCZ]+Z$/)
      for (const n of numeros(x.d)) expect(Number.isFinite(n)).toBe(true)
      expect(x.opacidad).toBeGreaterThan(0)
      expect(x.opacidad).toBeLessThanOrEqual(1)
    }
  })

  it('quedan dentro del lienzo (con un margen por el desborde del pincel)', () => {
    for (const [w, h] of [[1080, 1350], [1080, 1080], [1080, 1920]] as const) {
      for (const x of pinceladas(w, h, 11)) {
        const n = numeros(x.d)
        for (let i = 0; i < n.length; i += 2) {
          expect(n[i]!).toBeGreaterThanOrEqual(-80)
          expect(n[i]!).toBeLessThanOrEqual(w + 80)
          expect(n[i + 1]!).toBeGreaterThanOrEqual(-80)
          expect(n[i + 1]!).toBeLessThanOrEqual(h + 80)
        }
      }
    }
  })
})

import { diagonales } from './decorados'

describe('diagonales (decorado de la deportiva)', () => {
  it('son deterministas y dependen del lienzo', () => {
    expect(diagonales(1080, 1350)).toEqual(diagonales(1080, 1350))
    expect(diagonales(1080, 1350)).not.toEqual(diagonales(1080, 1920))
  })
  it('son polígonos cerrados de 4 puntos, dentro del lienzo con margen, y no quedan vacíos', () => {
    for (const [w, h] of [[1080, 1350], [1080, 1080], [1080, 1920]] as const) {
      const d = diagonales(w, h)
      expect(d.length).toBeGreaterThanOrEqual(3)
      for (const x of d) {
        expect(x.d).toMatch(/^M[\d\s.,\-L]+Z$/)
        const n = (x.d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number)
        expect(n).toHaveLength(8)
        for (let i = 0; i < 8; i += 2) {
          expect(n[i]!).toBeGreaterThanOrEqual(-200)
          expect(n[i]!).toBeLessThanOrEqual(w + 200)
        }
      }
    }
  })
})
