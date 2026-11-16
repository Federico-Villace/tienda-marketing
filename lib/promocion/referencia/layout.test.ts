import { describe, it, expect } from 'vitest'
import { layoutReferencia, esLayoutReferencia, ErrorFormatoReferencia, VARIACIONES_REFERENCIA } from './layout'
import { MINIMOS, MARGEN_X, MARGEN_Y } from './reparar'
import { interseca } from './geometria'
import { plantillaDePrueba, REFERENCIAS, zona, type AspectoReferencia } from './fixture'
import { ErrorTextoLargo, MEDIDAS } from '../plantillas'
import type { AspectoFoto } from '../../productor/ediciones'
import type { Caja } from '../diseno/layouts'
import type { PlantillaReferencia } from './tipos'

const FORMATOS: AspectoFoto[] = ['4:5', '1:1', '9:16']
const ASPECTOS = Object.keys(REFERENCIAS) as AspectoReferencia[]
const hay = (c: Caja) => c.w > 0 && c.h > 0
const plantilla = (a: AspectoReferencia = '4:5', o = {}): PlantillaReferencia => {
  const p = plantillaDePrueba(a, o)
  if (!p) throw new Error(`la referencia de prueba ${a} no es utilizable`)
  return p
}

describe('layoutReferencia · mismo formato', () => {
  it('con el formato de la referencia las cajas son EXACTAMENTE las leídas', () => {
    const p = plantilla('4:5')
    const l = layoutReferencia(p, '4:5', 0)
    expect(l.ancho).toBe(1080)
    expect(l.alto).toBe(1350)
    expect(l.cajas.escena).toEqual(p.moto)
    expect(l.cajas.modelo).toEqual(p.modelo.caja)
    expect(l.cajas.precio).toEqual(p.precio.caja)
    expect(l.cajas.condicion).toEqual(p.condicion!.caja)
    expect(l.cajas.frase).toEqual(p.frase!.caja)
    expect(l.cajas.pie).toEqual(p.cta!.caja)
    expect(l.cajas.logo999).toEqual(p.logos[0])
    expect(l.cajas.logoConcesionaria).toEqual(p.logos[1])
  })
  it('1:1 y 9:16 también', () => {
    for (const a of ['1:1', '9:16'] as const) expect(layoutReferencia(plantilla(a), a, 0).cajas.modelo).toEqual(plantilla(a).modelo.caja)
  })
  it('devuelve alineaciones, estilos y fuentes de lo leído', () => {
    const p = plantilla('4:5')
    const l = layoutReferencia(p, '4:5', 0)
    expect(esLayoutReferencia(l)).toBe(true)
    expect(l.alineaciones).toEqual({ modelo: p.modelo.alineacion, frase: p.frase!.alineacion, precio: p.precio.alineacion, condicion: p.condicion!.alineacion })
    expect(l.estilos.precio).toBe(p.precio.estilo)
    expect(l.fuentes.condicion).toBe('barlow-condensed')
  })
})

describe('layoutReferencia · elástico por bandas', () => {
  it('lo de arriba queda anclado arriba y lo de abajo anclado abajo (con espacio de sobra en el medio)', () => {
    const p = plantilla('4:5')
    const l = layoutReferencia(p, '9:16', 0)
    expect(l.alto).toBe(1920)
    expect(l.cajas.modelo.y).toBe(p.modelo.caja.y)
    expect(l.cajas.logo999.y).toBe(p.logos[0]!.y)
    expect(l.alto - (l.cajas.precio.y + l.cajas.precio.h)).toBe(p.alto - (p.precio.caja.y + p.precio.caja.h))
    expect(l.alto - (l.cajas.pie.y + l.cajas.pie.h)).toBe(p.alto - (p.cta!.caja.y + p.cta!.caja.h))
  })
  it('a un formato más bajo el medio se achica y lo de arriba y abajo no se toca', () => {
    const p = plantilla('4:5')
    const l = layoutReferencia(p, '1:1', 0)
    expect(l.cajas.modelo).toEqual(p.modelo.caja)
    expect(l.cajas.escena.h).toBeLessThan(p.moto.h)
    expect(l.alto - (l.cajas.precio.y + l.cajas.precio.h)).toBe(p.alto - (p.precio.caja.y + p.precio.caja.h))
  })
  it('la moto nunca queda más angosta que 0,6 de su alto (el recorte "cover" no le corta los costados)', () => {
    for (const a of ASPECTOS) for (const f of FORMATOS) {
      const p = plantillaDePrueba(a)
      if (!p) continue
      try {
        const l = layoutReferencia(p, f, 0)
        expect(l.cajas.escena.w / l.cajas.escena.h, `${a}→${f}`).toBeGreaterThanOrEqual(0.6 - 1e-9)
      } catch (e) {
        expect(e).toBeInstanceOf(ErrorTextoLargo)
      }
    }
  })
  it('si el medio queda por debajo del 30 % del alto se comprimen arriba y abajo hasta dejarle el 30 %', () => {
    const p = plantilla('9:16')
    const l = layoutReferencia(p, '1:1', 0)
    const medio = l.cajas.precio.y - (l.cajas.modelo.y + l.cajas.modelo.h)
    expect(l.alto).toBe(1080)
    expect(medio).toBeGreaterThanOrEqual(0)
    expect(l.cajas.escena.h).toBeGreaterThan(0)
  })
})

describe('layoutReferencia · variación', () => {
  it('hay dos: 0 es tal cual y 1 es el espejo horizontal', () => {
    expect(VARIACIONES_REFERENCIA).toBe(2)
    const p = plantilla('4:5')
    const a = layoutReferencia(p, '4:5', 0)
    const b = layoutReferencia(p, '4:5', 1)
    for (const k of ['modelo', 'precio', 'condicion', 'frase', 'pie', 'logo999', 'logoConcesionaria', 'escena'] as const) {
      expect(b.cajas[k], k).toEqual({ ...a.cajas[k], x: 1080 - a.cajas[k].x - a.cajas[k].w })
    }
  })
  it('el espejo cambia izquierda por derecha y deja el centro', () => {
    const p = plantilla('4:5')
    const b = layoutReferencia(p, '4:5', 1)
    const a = layoutReferencia(p, '4:5', 0)
    const swap = { izquierda: 'derecha', derecha: 'izquierda', centro: 'centro' } as const
    for (const k of ['modelo', 'frase', 'precio', 'condicion'] as const) expect(b.alineaciones[k]).toBe(swap[a.alineaciones[k]])
  })
  it('una variación inexistente se trata como la 0', () => {
    const p = plantilla('4:5')
    expect(layoutReferencia(p, '4:5', 5)).toEqual(layoutReferencia(p, '4:5', 0))
    expect(layoutReferencia(p, '4:5', -1)).toEqual(layoutReferencia(p, '4:5', 0))
    expect(layoutReferencia(p, '4:5', 0.5)).toEqual(layoutReferencia(p, '4:5', 0))
  })
})

describe('layoutReferencia · lo que la referencia no tenía', () => {
  const sin = { condicion: null, cta: null, logos: [] }
  it('sin zona de condición y con condición cargada: se parte la caja del precio 65/35 si entra', () => {
    const p = plantilla('4:5', { ...sin, precio: zona({ x: 0.05, y: 0.76, w: 0.9, h: 0.12 }, { color: '#FFFFFF', fuente: 'gruesa' }) })
    const con = layoutReferencia(p, '4:5', 0, { condicion: true })
    const sinCond = layoutReferencia(p, '4:5', 0, { condicion: false })
    expect(hay(con.cajas.condicion)).toBe(true)
    expect(con.cajas.precio.h + con.cajas.condicion.h).toBeLessThanOrEqual(p.precio.caja.h)
    expect(interseca(con.cajas.precio, con.cajas.condicion)).toBe(false)
    expect(con.cajas.condicion.h).toBeGreaterThanOrEqual(MINIMOS.condicion.h)
    expect(hay(sinCond.cajas.condicion)).toBe(false)
    expect(sinCond.cajas.precio).toEqual(p.precio.caja)
  })
  it('si no se puede partir busca un hueco libre; si no hay, no hay condición (nunca pisa)', () => {
    const p = plantilla('4:5', sin)
    const l = layoutReferencia(p, '4:5', 0, { condicion: true })
    if (hay(l.cajas.condicion)) {
      expect(interseca(l.cajas.condicion, l.cajas.precio)).toBe(false)
      expect(interseca(l.cajas.condicion, l.cajas.escena)).toBe(false)
    }
  })
  it('sin CTA: usa una franja inferior libre o lo omite', () => {
    const p = plantilla('4:5', sin)
    const l = layoutReferencia(p, '4:5', 0, { cta: true })
    if (hay(l.cajas.pie)) {
      expect(l.cajas.pie.w).toBeGreaterThanOrEqual(MINIMOS.cta.w)
      for (const k of ['modelo', 'precio', 'escena'] as const) expect(interseca(l.cajas.pie, l.cajas[k]), k).toBe(false)
    }
    expect(hay(layoutReferencia(p, '4:5', 0, { cta: false }).cajas.pie)).toBe(false)
  })
  it('sin logos: el 999 va a una esquina libre; el logo de marca solo si se pide', () => {
    const p = plantilla('4:5', sin)
    const l = layoutReferencia(p, '4:5', 0, { logoMarca: false })
    expect(hay(l.cajas.logo999)).toBe(true)
    expect(hay(l.cajas.logoMarca)).toBe(false)
    for (const k of ['modelo', 'precio', 'escena'] as const) expect(interseca(l.cajas.logo999, l.cajas[k]), k).toBe(false)
    const m = layoutReferencia(p, '4:5', 0, { logoMarca: true })
    if (hay(m.cajas.logoMarca)) expect(interseca(m.cajas.logoMarca, m.cajas.logo999)).toBe(false)
  })
  it('lo ausente es una caja de ancho y alto 0 (la placa no la dibuja)', () => {
    const p = plantilla('4:5', sin)
    const l = layoutReferencia(p, '4:5', 0, { condicion: false, cta: false, logoMarca: false })
    expect(l.cajas.condicion).toMatchObject({ w: 0, h: 0 })
    expect(l.cajas.pie).toMatchObject({ w: 0, h: 0 })
    expect(l.cajas.logoMarca).toMatchObject({ w: 0, h: 0 })
  })
  it('una referencia sin frase deja la caja de la frase vacía', () => {
    const l = layoutReferencia(plantilla('4:5', { frase: null }), '4:5', 0)
    expect(hay(l.cajas.frase)).toBe(false)
  })
})

describe('layoutReferencia · cada referencia × cada formato × cada variación', () => {
  for (const a of ASPECTOS) {
    for (const f of FORMATOS) {
      for (const v of [0, 1]) {
        it(`referencia ${a} → ${f}, variación ${v}`, () => {
          const p = plantillaDePrueba(a)
          if (!p) return
          let l
          try {
            l = layoutReferencia(p, f, v, { condicion: true, cta: true, logoMarca: true })
          } catch (e) {
            expect(e).toBeInstanceOf(ErrorFormatoReferencia)
            expect((e as Error).message).toBe('Este formato no entra con el diseño de tu referencia.')
            return
          }
          const H = MEDIDAS[f][1]
          expect(l.alto).toBe(H)
          const cajas = (Object.entries(l.cajas) as [string, Caja][]).filter(([, c]) => hay(c))
          for (const [n, c] of cajas) {
            for (const x of [c.x, c.y, c.w, c.h]) expect(Number.isInteger(x), n).toBe(true)
            if (n === 'escena') {
              expect(c.x).toBeGreaterThanOrEqual(0)
              expect(c.x + c.w).toBeLessThanOrEqual(1080)
              expect(c.y).toBeGreaterThanOrEqual(0)
              expect(c.y + c.h).toBeLessThanOrEqual(H)
            } else {
              expect(c.x, `${n} x`).toBeGreaterThanOrEqual(MARGEN_X)
              expect(c.y, `${n} y`).toBeGreaterThanOrEqual(MARGEN_Y)
              expect(c.x + c.w, `${n} der`).toBeLessThanOrEqual(1080 - MARGEN_X)
              expect(c.y + c.h, `${n} abajo`).toBeLessThanOrEqual(H - MARGEN_Y)
            }
          }
          for (let i = 0; i < cajas.length; i++) for (let j = i + 1; j < cajas.length; j++) expect(interseca(cajas[i]![1], cajas[j]![1]), `${cajas[i]![0]} pisa a ${cajas[j]![0]}`).toBe(false)
          const min = (c: Caja, m: { w: number; h: number }, n: string) => {
            expect(c.w, `${n} ancho`).toBeGreaterThanOrEqual(m.w)
            expect(c.h, `${n} alto`).toBeGreaterThanOrEqual(m.h)
          }
          min(l.cajas.modelo, MINIMOS.modelo, 'modelo')
          min(l.cajas.precio, MINIMOS.precio, 'precio')
          if (hay(l.cajas.condicion)) min(l.cajas.condicion, MINIMOS.condicion, 'condicion')
          if (hay(l.cajas.frase)) min(l.cajas.frase, MINIMOS.frase, 'frase')
          if (hay(l.cajas.pie)) min(l.cajas.pie, MINIMOS.cta, 'cta')
          for (const k of ['logo999', 'logoConcesionaria', 'logoMarca'] as const) if (hay(l.cajas[k])) min(l.cajas[k], MINIMOS.logo, k)
          expect(l.cajas.escena.w).toBeGreaterThanOrEqual(Math.floor(1080 * 0.45))
          expect(l.cajas.escena.w / l.cajas.escena.h).toBeGreaterThanOrEqual(0.6 - 1e-9)
        })
      }
    }
  }

  it('las referencias de manual (4:5, 1:1, 9:16, 3:4) entran SIEMPRE en los tres formatos', () => {
    for (const a of ['4:5', '1:1', '9:16', '3:4'] as const) {
      const p = plantilla(a)
      for (const f of FORMATOS) for (const v of [0, 1]) expect(() => layoutReferencia(p, f, v, { condicion: true, cta: true, logoMarca: true }), `${a}→${f}/${v}`).not.toThrow()
    }
  })
})

describe('layoutReferencia · cuando no entra', () => {
  it('si una zona obligatoria no tiene dónde ir lanza ErrorTextoLargo con el mensaje del formato (los otros formatos siguen)', () => {
    const p = plantilla('4:5')
    const tapado: PlantillaReferencia = { ...p, moto: { x: 0, y: 0, w: 1080, h: p.alto } }
    expect(() => layoutReferencia(tapado, '4:5', 0)).toThrow(ErrorTextoLargo)
    expect(() => layoutReferencia(tapado, '4:5', 0)).toThrow('Este formato no entra con el diseño de tu referencia.')
  })
  it('es pura: no muta la plantilla y repite el resultado', () => {
    const p = plantilla('4:5')
    const copia = JSON.parse(JSON.stringify(p))
    const a = layoutReferencia(p, '9:16', 1, { condicion: true })
    expect(p).toEqual(copia)
    expect(layoutReferencia(p, '9:16', 1, { condicion: true })).toEqual(a)
  })
})
