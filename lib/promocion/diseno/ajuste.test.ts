import { describe, it, expect } from 'vitest'
import { ajustarDiseno, PRECIO_OCULTO } from './ajuste'
import { layoutDiseno } from './layouts'
import { resolverDiseno } from './defaults'
import { ErrorTextoLargo, type TextosPlaca } from '../plantillas'
import type { Diseno } from './tipos'
import type { AspectoFoto } from '../../productor/ediciones'

const textos = (o: Partial<TextosPlaca> = {}): TextosPlaca => ({ marca: 'Benelli Store Quilmes', modelo: 'TRK 502', precio: '$ 4.500.000', promo: '12 cuotas sin interés', titular: 'Tu próxima aventura', extra: '', lugar: 'Quilmes', ...o })
const datos = { precio: { moneda: 'ARS' as const, monto: 4_500_000 }, promo: { tipo: 'cuotas' as const, detalle: '12 cuotas sin interés' }, lugar: 'Quilmes', indicaciones: '' }
const resuelto = (d: Diseno | null = null, t = textos()) => resolverDiseno(d, 'impactante_textura', { modelo: t.modelo, titular: t.titular, datos })
const lay = (f: AspectoFoto = '4:5') => layoutDiseno('impactante_textura', f)
const ajustar = (o: { t?: Partial<TextosPlaca>; d?: Diseno | null; f?: AspectoFoto } = {}) => {
  const t = textos(o.t)
  return ajustarDiseno(t, resuelto(o.d ?? null, t), lay(o.f))
}

describe('ajustarDiseno (impactante)', () => {
  it('un modelo corto va en una línea y entra en su caja, en los tres formatos', () => {
    for (const f of ['4:5', '1:1', '9:16'] as const) {
      const a = ajustar({ f })
      expect(a.modelo.lineas).toBe(1)
      expect(a.modelo.tam * 1.15 * a.modelo.lineas).toBeLessThanOrEqual(lay(f).cajas.modelo.h)
    }
  })

  it('un modelo largo pasa a 2 líneas achicando la letra', () => {
    const corto = ajustar().modelo
    const largo = ajustar({ t: { modelo: 'Street Triple 765 RS Moto2 Edition' } }).modelo
    expect(largo.lineas).toBe(2)
    expect(largo.tam).toBeLessThan(corto.tam)
    expect(largo.tam * 1.15 * 2).toBeLessThanOrEqual(lay().cajas.modelo.h)
  })

  it('un modelo imposible lanza ErrorTextoLargo (campo modelo), sin dibujar nada', () => {
    const e = (() => { try { ajustar({ t: { modelo: 'X'.repeat(100) } }) } catch (x) { return x } })()
    expect(e).toBeInstanceOf(ErrorTextoLargo)
    expect((e as ErrorTextoLargo).campo).toBe('modelo')
  })

  describe('tamanos (−2..+2 = ±8 % por paso)', () => {
    it('subir agranda y bajar achica, en pasos de ~8 %', () => {
      const base = ajustar({ t: { modelo: 'Street Triple 765' } }).modelo.tam
      const m1 = ajustar({ t: { modelo: 'Street Triple 765' }, d: { tamanos: { modelo: -1 } } }).modelo.tam
      const m2 = ajustar({ t: { modelo: 'Street Triple 765' }, d: { tamanos: { modelo: -2 } } }).modelo.tam
      expect(m1).toBe(Math.round(base * 0.92))
      expect(m2).toBe(Math.round(base * 0.84))
    })
    it('+1 y +2 agrandan lo que la caja permita, y nunca se salen de ella', () => {
      for (const n of [1, 2]) {
        for (const modelo of ['TRK 502', 'Street Triple 765 RS Moto2 Edition', 'Z400']) {
          const a = ajustar({ t: { modelo }, d: { tamanos: { modelo: n } } })
          expect(a.modelo.tam * 1.15 * a.modelo.lineas, `${modelo} +${n}`).toBeLessThanOrEqual(lay().cajas.modelo.h + 0.5)
        }
      }
      const base = ajustar().modelo.tam
      expect(ajustar({ d: { tamanos: { modelo: 1 } } }).modelo.tam).toBe(Math.round(base * 1.08))
    })
    it('frase y precio tienen su propio ajuste', () => {
      const a = ajustar()
      expect(ajustar({ d: { tamanos: { frase: 2 } } }).frase.tam).toBeGreaterThan(a.frase.tam)
      expect(ajustar({ d: { tamanos: { precio: -2 } } }).precio.tam).toBeLessThan(a.precio.tam)
      expect(ajustar({ d: { tamanos: { frase: 2 } } }).modelo.tam).toBe(a.modelo.tam)
    })
  })

  describe('precio', () => {
    it('sale tal cual de textos.precio (formatearPrecio): ARS y USD', () => {
      expect(ajustar().textoPrecio).toBe('$ 4.500.000')
      expect(ajustar({ t: { precio: 'US$ 12.000' } }).textoPrecio).toBe('US$ 12.000')
    })
    it('mostrarPrecio=false → CONSULTÁ PRECIO y no se dibuja el monto', () => {
      const a = ajustar({ d: { mostrarPrecio: false } })
      expect(a.textoPrecio).toBe(PRECIO_OCULTO)
      expect(PRECIO_OCULTO).toBe('CONSULTÁ PRECIO')
      expect(JSON.stringify(a)).not.toContain('4.500.000')
    })
    it('va siempre en una línea y entra en su caja', () => {
      const a = ajustar({ t: { precio: 'US$ 9.999.999' } })
      const c = lay().cajas.precio
      expect(a.precio.tam * 1.15).toBeLessThanOrEqual(c.h)
      expect(a.precio.tam * 0.5 * 'US$ 9.999.999'.length).toBeLessThanOrEqual(c.w)
    })
  })

  it('la frase va en hasta 2 líneas y sin frase no hay bloque', () => {
    expect(ajustar().frase.lineas).toBeGreaterThanOrEqual(1)
    expect(ajustar().frase.lineas).toBeLessThanOrEqual(2)
    expect(ajustar({ d: { frase: undefined }, t: { titular: '' } }).frase.lineas).toBe(0)
  })

  it('la condición: dos filas con destacado, una sin él; vacía no se dibuja', () => {
    expect(ajustar().filasCondicion).toBe(2)
    expect(ajustar({ d: { condicion: { texto: 'CONTADO', destacado: '' } } }).filasCondicion).toBe(1)
    expect(ajustar({ d: { condicion: { texto: '', destacado: '' } } }).filasCondicion).toBe(0)
  })

  it('el pie: un lugar que no entra lanza ErrorTextoLargo del lugar', () => {
    const e = (() => { try { ajustar({ t: { lugar: 'Av. Hipólito Yrigoyen y Calle Muy Larga de Quilmes Oeste, Buenos Aires' } }) } catch (x) { return x } })()
    expect(e).toBeInstanceOf(ErrorTextoLargo)
    expect((e as ErrorTextoLargo).campo).toBe('lugar')
  })

  it('es determinista: mismos datos, mismo ajuste', () => {
    expect(ajustar()).toEqual(ajustar())
  })
})
