import { describe, it, expect } from 'vitest'
import { bandaMoto, cajasDeTexto, layoutDiseno, type Caja, type LayoutDiseno } from './layouts'
import { MEDIDAS } from '../plantillas'
import type { AspectoFoto } from '../../productor/ediciones'

const FORMATOS: AspectoFoto[] = ['4:5', '1:1', '9:16']
const dentro = (c: Caja, l: LayoutDiseno) => c.x >= 0 && c.y >= 0 && c.x + c.w <= l.ancho && c.y + c.h <= l.alto && c.w > 0 && c.h > 0
const solapan = (a: Caja, b: Caja) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

for (const plantilla of ['impactante_textura', 'deportiva', 'editorial'] as const) describe(`layoutDiseno · ${plantilla}`, () => {
  for (const f of FORMATOS) {
    describe(f, () => {
      const l = layoutDiseno(plantilla, f)

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

      it('el modelo va debajo del logo y el precio debajo de la frase', () => {
        expect(l.cajas.modelo.y).toBeGreaterThan(l.cajas.logo999.y)
        expect(l.cajas.precio.y).toBeGreaterThan(l.cajas.frase.y)
      })

      it.skipIf(plantilla === 'impactante_textura')('frase, precio y condición sobre la parte baja de la escena', () => {
        expect(l.cajas.frase.y).toBeGreaterThan(l.cajas.escena.y + l.cajas.escena.h * 0.5)
      })
    })
  }

  it('9:16 y 4:5 NO son un escalado del 1:1: las posiciones son distintas (se recoloca, no se estira)', () => {
    const a = layoutDiseno(plantilla, '4:5').cajas
    const b = layoutDiseno(plantilla, '9:16').cajas
    const distintas = (Object.keys(a) as (keyof typeof a)[]).filter((k) => Math.abs(a[k]!.y / 1350 - b[k]!.y / 1920) > 0.005)
    expect(distintas.length).toBeGreaterThanOrEqual(3)
  })

})

describe('layoutDiseno · editorial (cajas propias)', () => {
  for (const f of FORMATOS) {
    it(`${f}: número, círculo, lista y banda dentro del lienzo; la banda contiene precio, condición y pie`, () => {
      const l = layoutDiseno('editorial', f)
      const { numero, circulo, lista, banda, precio, condicion, pie } = l.cajas
      for (const c of [numero, circulo, lista, banda]) expect(dentro(c!, l)).toBe(true)
      for (const c of [precio, condicion, pie]) {
        expect(c.y).toBeGreaterThanOrEqual(banda!.y)
        expect(c.y + c.h).toBeLessThanOrEqual(banda!.y + banda!.h)
      }
    })
    it(`${f}: el círculo y el número asoman por arriba de la escena (para verse) y se meten detrás de ella; la lista cuenta como texto`, () => {
      const l = layoutDiseno('editorial', f)
      const { escena, circulo, numero } = l.cajas
      for (const c of [circulo!, numero!]) {
        expect(c.y, `${f} arranca antes que la escena`).toBeLessThan(escena.y)
        expect(c.y + c.h, `${f} termina dentro de la escena`).toBeGreaterThan(escena.y + escena.h * 0.2)
      }
      expect(cajasDeTexto(l).map(([n]) => n)).toContain('lista')
    })
    it(`${f}: el número no cae sobre el nombre del modelo (los dos son negros)`, () => {
      const l = layoutDiseno('editorial', f)
      const { modelo, numero } = l.cajas
      // El dígito ocupa ~70 % del centro de su caja: ese tramo queda debajo del modelo.
      const arrancaGlifo = numero!.y + numero!.h * 0.15
      expect(arrancaGlifo).toBeGreaterThanOrEqual(modelo.y + modelo.h * 0.8)
    })
  }
})

describe('layoutDiseno · impactante (como la referencia)', () => {
  for (const f of FORMATOS) {
    describe(f, () => {
      const l = layoutDiseno('impactante_textura', f)
      const c = l.cajas
      const banda = bandaMoto(l)

      it('el modelo ocupa todo el ancho y buena parte del alto (la referencia: ROUSER a lo ancho, ~1/4 del alto)', () => {
        expect(c.modelo.w).toBeGreaterThanOrEqual(l.ancho * 0.9)
        expect(c.modelo.h / l.alto).toBeGreaterThanOrEqual(0.15)
      })

      it('la frase queda ARRIBA de la franja de la moto y el precio y la condición ABAJO: ningún texto grande cae sobre la moto', () => {
        expect(c.frase.y + c.frase.h, 'frase').toBeLessThanOrEqual(banda.y)
        expect(c.precio.y, 'precio').toBeGreaterThanOrEqual(banda.y + banda.h)
        expect(c.condicion.y, 'condición').toBeGreaterThanOrEqual(banda.y + banda.h)
        expect(solapan(c.modelo, banda)).toBe(false)
      })

      it('el precio va solo en su fila, centrado y a lo ancho; la condición va debajo y el pie después', () => {
        expect(c.precio.w).toBeGreaterThanOrEqual(l.ancho * 0.9)
        expect(Math.abs(c.precio.x + c.precio.w / 2 - l.ancho / 2)).toBeLessThanOrEqual(1)
        expect(c.condicion.y).toBeGreaterThanOrEqual(c.precio.y + c.precio.h)
        expect(c.pie.y).toBeGreaterThanOrEqual(c.condicion.y + c.condicion.h)
      })

      it('a la derecha solo se espeja la frase (el precio y la condición ya están centrados) y sigue sin tocar la moto', () => {
        const d = layoutDiseno('impactante_textura', f, 'derecha')
        expect(d.cajas.frase.x).toBeGreaterThan(c.frase.x)
        expect(d.cajas.precio).toEqual(c.precio)
        expect(d.cajas.condicion).toEqual(c.condicion)
        expect(solapan(d.cajas.frase, bandaMoto(d))).toBe(false)
      })
    })
  }
})

describe('layoutDiseno · deportiva (como la referencia)', () => {
  for (const f of FORMATOS) {
    describe(f, () => {
      const l = layoutDiseno('deportiva', f)
      const c = l.cajas
      const banda = bandaMoto(l)

      it('el contorno del modelo está a la VISTA: justo debajo del panel y por encima de la franja de la moto (no queda detrás de nada)', () => {
        const k = c.contorno!
        expect(k.y).toBeGreaterThanOrEqual(c.modelo.y + c.modelo.h)
        expect(k.y + k.h).toBeLessThanOrEqual(banda.y)
        expect(k.w).toBe(c.modelo.w)
      })

      it('la frase va DEBAJO de la moto (nunca encima de la rueda), grande y a lo ancho; después el precio, la condición y el pie', () => {
        expect(c.frase.y).toBeGreaterThanOrEqual(banda.y + banda.h)
        expect(c.frase.w).toBeGreaterThanOrEqual(l.ancho * 0.9)
        expect(c.precio.y).toBeGreaterThanOrEqual(c.frase.y + c.frase.h)
        expect(c.precio.w).toBeGreaterThanOrEqual(l.ancho * 0.9)
        expect(c.condicion.y).toBeGreaterThanOrEqual(c.precio.y + c.precio.h)
        expect(c.pie.y).toBeGreaterThanOrEqual(c.condicion.y + c.condicion.h)
      })

      it('ningún texto cae sobre la franja de la moto', () => {
        for (const [nombre, caja] of cajasDeTexto(l)) expect(solapan(caja, banda), `${f}: ${nombre}`).toBe(false)
      })

      it('el logo va centrado arriba (deja libre la esquina para la diagonal)', () => {
        expect(Math.abs(c.logo999.x + c.logo999.w / 2 - l.ancho / 2)).toBeLessThanOrEqual(1)
      })

      it("a la derecha las cajas no se mueven (ocupan todo el ancho): la frase solo se alinea al otro lado al dibujarla", () => {
        expect(layoutDiseno('deportiva', f, 'derecha').cajas).toEqual(c)
      })
    })
  }
})
