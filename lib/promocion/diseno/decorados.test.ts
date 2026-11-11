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
import { layoutDiseno } from './layouts'
import type { AspectoFoto } from '../../productor/ediciones'

describe('pinceladas · zonas que evitar (la frase va en el color de acento)', () => {
  const solapan = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
  it.each(['4:5', '1:1', '9:16'] as AspectoFoto[])('%s: ninguna pincelada chica cae sobre la caja de la frase, con ninguna semilla', (f) => {
    const l = layoutDiseno('impactante_textura', f)
    for (const semilla of [1, 7, 42, 20261110, 99999]) {
      for (const p of pinceladas(l.ancho, l.alto, semilla, [l.cajas.frase])) {
        if (p.caja) expect(solapan(p.caja, l.cajas.frase), `semilla ${semilla}`).toBe(false)
      }
    }
  })
  it('descartar una no cambia la forma de las otras (el azar se gasta igual) y sin zonas salen todas', () => {
    const todas = pinceladas(1080, 1350, 5)
    const algunas = pinceladas(1080, 1350, 5, [{ x: 0, y: 0, w: 1080, h: 1350 }])
    expect(algunas.length).toBe(2) // solo las dos grandes, que no se descartan
    for (const p of algunas) expect(todas.map((x) => x.d)).toContain(p.d)
    expect(todas.length).toBe(6)
  })
})

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

import { curvasDeNivel } from './decorados'

describe('curvasDeNivel (decorado de la editorial)', () => {
  it('son deterministas por semilla y lienzo', () => {
    expect(curvasDeNivel(1080, 1350, 5)).toEqual(curvasDeNivel(1080, 1350, 5))
    expect(curvasDeNivel(1080, 1350, 5)).not.toEqual(curvasDeNivel(1080, 1350, 6))
    expect(curvasDeNivel(1080, 1350, 5)).not.toEqual(curvasDeNivel(1080, 1920, 5))
  })
  it('son anillos cerrados concéntricos y suaves, con números finitos, de a varios', () => {
    const c = curvasDeNivel(1080, 1350, 7)
    expect(c.length).toBeGreaterThanOrEqual(8)
    for (const x of c) {
      expect(x.d).toMatch(/^M[\d\s.,\-LQCZ]+Z$/)
      for (const n of numeros(x.d)) expect(Number.isFinite(n)).toBe(true)
    }
  })
  it('los anillos pueden asomar del lienzo (se recortan), pero no se van lejos', () => {
    for (const [w, h] of [[1080, 1350], [1080, 1080], [1080, 1920]] as const) {
      for (const x of curvasDeNivel(w, h, 3)) {
        const n = numeros(x.d)
        for (let i = 0; i < n.length; i += 2) {
          expect(n[i]!).toBeGreaterThanOrEqual(-600)
          expect(n[i]!).toBeLessThanOrEqual(w + 600)
          expect(n[i + 1]!).toBeGreaterThanOrEqual(-600)
          expect(n[i + 1]!).toBeLessThanOrEqual(h + 600)
        }
      }
    }
  })
})
