import { describe, it, expect } from 'vitest'
import { cajasDeTexto, layoutDiseno, type Caja, type LayoutDiseno } from './layouts'
import { MEDIDAS } from '../plantillas'
import type { AspectoFoto } from '../../productor/ediciones'

const FORMATOS: AspectoFoto[] = ['4:5', '1:1', '9:16']
const dentro = (c: Caja, l: LayoutDiseno) => c.x >= 0 && c.y >= 0 && c.x + c.w <= l.ancho && c.y + c.h <= l.alto && c.w > 0 && c.h > 0
const solapan = (a: Caja, b: Caja) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

describe('layoutDiseno · impactante_textura', () => {
  for (const f of FORMATOS) {
    describe(f, () => {
      const l = layoutDiseno('impactante_textura', f)

      it('mide lo mismo que el formato (1080 de ancho)', () => {
        expect([l.ancho, l.alto]).toEqual(MEDIDAS[f])
      })

      it('todas las cajas están dentro del lienzo', () => {
        for (const [nombre, c] of Object.entries(l.cajas)) expect(dentro(c, l), `${f} ${nombre}`).toBe(true)
      })

      it('la moto (escena) ocupa ≥45 % del alto en 4:5 y 9:16, ≥40 % en 1:1', () => {
        const minimo = f === '1:1' ? 0.4 : 0.45
        expect(l.cajas.escena.h / l.alto).toBeGreaterThanOrEqual(minimo)
        expect(l.cajas.escena.w).toBe(l.ancho)
      })

      it('ningún texto se solapa con otro texto', () => {
        const textos = cajasDeTexto(l)
        for (let i = 0; i < textos.length; i++) {
          for (let j = i + 1; j < textos.length; j++) {
            expect(solapan(textos[i]![1], textos[j]![1]), `${f}: ${textos[i]![0]} con ${textos[j]![0]}`).toBe(false)
          }
        }
      })

      it('el logo 999 va arriba y el pie abajo', () => {
        expect(l.cajas.logo999.y).toBeLessThan(l.alto * 0.1)
        expect(l.cajas.logo999.y + l.cajas.logo999.h).toBeLessThan(l.cajas.modelo.y + 1)
        expect(l.cajas.pie.y).toBeGreaterThan(l.alto * 0.7)
        expect(l.cajas.logoConcesionaria.y).toBeGreaterThanOrEqual(l.cajas.pie.y + l.cajas.pie.h)
      })

      it('el modelo va entre el logo y la escena; frase, precio y condición sobre la parte baja de la escena', () => {
        expect(l.cajas.modelo.y).toBeGreaterThan(l.cajas.logo999.y)
        expect(l.cajas.frase.y).toBeGreaterThan(l.cajas.escena.y + l.cajas.escena.h * 0.5)
        expect(l.cajas.precio.y).toBeGreaterThan(l.cajas.frase.y)
      })
    })
  }

  it('9:16 y 4:5 NO son un escalado del 1:1: las posiciones son distintas (se recoloca, no se estira)', () => {
    const a = layoutDiseno('impactante_textura', '4:5').cajas
    const b = layoutDiseno('impactante_textura', '9:16').cajas
    expect(a.precio.y / 1350).not.toBeCloseTo(b.precio.y / 1920, 2)
  })

  it('la frase puede ir a la derecha: espeja la caja de frase y la de precio/condición', () => {
    const izq = layoutDiseno('impactante_textura', '4:5', 'izquierda').cajas
    const der = layoutDiseno('impactante_textura', '4:5', 'derecha').cajas
    expect(der.frase.x).toBeGreaterThan(izq.frase.x)
    expect(der.precio.x).toBeGreaterThan(izq.precio.x)
    expect(der.condicion.x).toBeLessThan(izq.condicion.x)
    for (const c of Object.values(der)) expect(c.x + c.w).toBeLessThanOrEqual(1080)
  })
})
