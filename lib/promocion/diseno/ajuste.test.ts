import { describe, it, expect } from 'vitest'
import { ajustarDiseno, METRICAS, partirFrase, PRECIO_OCULTO } from './ajuste'
import { layoutDiseno } from './layouts'
import { resolverDiseno } from './defaults'
import { ErrorTextoLargo, type TextosPlaca } from '../plantillas'
import type { Diseno } from './tipos'
import type { AspectoFoto } from '../../productor/ediciones'

const textos = (o: Partial<TextosPlaca> = {}): TextosPlaca => ({ marca: 'Benelli Store Quilmes', modelo: 'TRK 502', precio: '$ 4.500.000', promo: '12 cuotas sin interés', titular: 'Tu próxima aventura', extra: '', lugar: 'Quilmes', ...o })
const datos = { precio: { moneda: 'ARS' as const, monto: 4_500_000 }, promo: { tipo: 'cuotas' as const, detalle: '12 cuotas sin interés' }, lugar: 'Quilmes', indicaciones: '' }
const resuelto = (d: Diseno | null = null, t = textos()) => resolverDiseno(d, 'impactante_textura', { modelo: t.modelo, titular: t.titular, datos })
const LINEA = METRICAS.anton.linea
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
      expect(a.modelo.tam * LINEA * a.modelo.lineas).toBeLessThanOrEqual(lay(f).cajas.modelo.h)
    }
  })

  it('un modelo largo pasa a 2 líneas achicando la letra', () => {
    const corto = ajustar().modelo
    const largo = ajustar({ t: { modelo: 'Street Triple 765 RS Moto2 Edition' } }).modelo
    expect(largo.lineas).toBe(2)
    expect(largo.tam).toBeLessThan(corto.tam)
    expect(largo.tam * LINEA * 2).toBeLessThanOrEqual(lay().cajas.modelo.h)
  })

  it('un modelo imposible lanza ErrorTextoLargo (campo modelo), sin dibujar nada', () => {
    const e = (() => { try { ajustar({ t: { modelo: 'X'.repeat(100) } }) } catch (x) { return x } })()
    expect(e).toBeInstanceOf(ErrorTextoLargo)
    expect((e as ErrorTextoLargo).campo).toBe('modelo')
  })

  describe('tamanos (−2..+2 = ±12 % por paso)', () => {
    it('subir agranda y bajar achica, en pasos de ~12 % (se nota)', () => {
      const base = ajustar({ t: { modelo: 'Street Triple 765' } }).modelo.tam
      const m1 = ajustar({ t: { modelo: 'Street Triple 765' }, d: { tamanos: { modelo: -1 } } }).modelo.tam
      const m2 = ajustar({ t: { modelo: 'Street Triple 765' }, d: { tamanos: { modelo: -2 } } }).modelo.tam
      expect(m1).toBe(Math.round(base * 0.88))
      expect(m2).toBe(Math.round(base * 0.76))
    })
    it('+1 y +2 agrandan lo que la caja permita, y nunca se salen de ella', () => {
      for (const n of [1, 2]) {
        for (const modelo of ['TRK 502', 'Street Triple 765 RS Moto2 Edition', 'Z400']) {
          const a = ajustar({ t: { modelo }, d: { tamanos: { modelo: n } } })
          expect(a.modelo.tam * LINEA * a.modelo.lineas, `${modelo} +${n}`).toBeLessThanOrEqual(lay().cajas.modelo.h + 0.5)
        }
      }
      const base = ajustar().modelo.tam
      expect(ajustar({ d: { tamanos: { modelo: 1 } } }).modelo.tam).toBe(Math.round(base * 1.12))
    })
    it('frase y precio tienen su propio ajuste', () => {
      const a = ajustar()
      expect(ajustar({ d: { tamanos: { frase: 2 } } }).frase.tam).toBeGreaterThan(a.frase.tam)
      expect(ajustar({ d: { tamanos: { precio: -2 } } }).precio.tam).toBeLessThan(a.precio.tam)
      expect(ajustar({ d: { tamanos: { frase: 2 } } }).modelo.tam).toBe(a.modelo.tam)
    })
  })

  describe('tamaños como la referencia (modelo y precio grandes)', () => {
    it('el modelo corto ocupa buena parte del ancho de su caja y el precio también', () => {
      for (const f of ['4:5', '1:1', '9:16'] as const) {
        const a = ajustar({ f })
        const c = lay(f).cajas
        expect(a.modelo.tam * METRICAS.anton.ancho * 'TRK 502'.length, `modelo ${f}`).toBeGreaterThanOrEqual(c.modelo.w * 0.5)
        expect(a.precio.tam * METRICAS.anton.ancho * '$ 4.500.000'.length, `precio ${f}`).toBeGreaterThanOrEqual(c.precio.w * 0.5)
      }
    })
    it('+2 se nota: el modelo crece al menos un 10 % sobre el automático', () => {
      expect(ajustar({ d: { tamanos: { modelo: 2 } } }).modelo.tam).toBeGreaterThanOrEqual(Math.round(ajustar().modelo.tam * 1.1))
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
      expect(a.precio.tam * LINEA).toBeLessThanOrEqual(c.h)
      expect(a.precio.tam * 0.5 * 'US$ 9.999.999'.length).toBeLessThanOrEqual(c.w)
    })
  })

  it('la frase va en hasta 2 líneas y sin frase no hay bloque', () => {
    expect(ajustar().frase.lineas).toBeGreaterThanOrEqual(1)
    expect(ajustar().frase.lineas).toBeLessThanOrEqual(2)
    expect(ajustar({ d: { frase: undefined }, t: { titular: '' } }).frase.lineas).toBe(0)
  })

  it('la condición va en UNA fila (texto y destacado lado a lado) y entra en su caja', () => {
    for (const f of ['4:5', '1:1', '9:16'] as const) {
      const a = ajustar({ f })
      const c = lay(f).cajas.condicion
      expect(a.condicionEnFila).toBe(true)
      const ancho = ('12 CUOTAS SIN INTERÉS'.length) * a.condicionTam * METRICAS['barlow-condensed'].ancho + 68
      expect(ancho, f).toBeLessThanOrEqual(c.w)
      expect(a.condicionTam * METRICAS['barlow-condensed'].linea, f).toBeLessThanOrEqual(c.h)
    }
  })

  it('la condición: dos filas con destacado, una sin él; vacía no se dibuja', () => {
    expect(ajustar().filasCondicion).toBe(2)
    expect(ajustar({ d: { condicion: { texto: 'CONTADO', destacado: '' } } }).filasCondicion).toBe(1)
    expect(ajustar({ d: { condicion: { texto: '', destacado: '' } } }).filasCondicion).toBe(0)
  })

  it('el pie: un lugar que no entra lanza ErrorTextoLargo del lugar', () => {
    const e = (() => { try { ajustar({ t: { lugar: 'Av. Hipólito Yrigoyen y Calle Muy Larga de Quilmes Oeste, Buenos Aires, Argentina, Local 5 y 6' } }) } catch (x) { return x } })()
    expect(e).toBeInstanceOf(ErrorTextoLargo)
    expect((e as ErrorTextoLargo).campo).toBe('lugar')
  })

  it('es determinista: mismos datos, mismo ajuste', () => {
    expect(ajustar()).toEqual(ajustar())
  })
})

describe('ajustarDiseno (deportiva)', () => {
  const ajD = (o: { t?: Partial<TextosPlaca>; d?: Diseno | null; f?: AspectoFoto } = {}) => {
    const t = textos(o.t)
    const r = resolverDiseno(o.d ?? null, 'deportiva', { modelo: t.modelo, titular: t.titular, datos })
    return ajustarDiseno(t, r, layoutDiseno('deportiva', o.f ?? '4:5'), 'deportiva')
  }
  it('usa la fuente ancha: el mismo modelo sale más chico que en impactante', () => {
    expect(ajD({ t: { modelo: 'Street Triple 765' } }).modelo.tam).toBeLessThan(ajustar({ t: { modelo: 'Street Triple 765' } }).modelo.tam)
  })
  it('entra en su caja en los tres formatos y es determinista', () => {
    for (const f of ['4:5', '1:1', '9:16'] as const) {
      const a = ajD({ f })
      expect(a.modelo.tam * 1.1 * a.modelo.lineas).toBeLessThanOrEqual(layoutDiseno('deportiva', f).cajas.modelo.h)
      expect(a).toEqual(ajD({ f }))
    }
  })
  it('mostrarPrecio=false → CONSULTÁ PRECIO también en la barra', () => {
    expect(ajD({ d: { mostrarPrecio: false } }).textoPrecio).toBe(PRECIO_OCULTO)
  })
})

describe('partirFrase (dos colores)', () => {
  it('parte por palabras donde las dos líneas quedan más parejas: la primera blanca, la segunda de acento', () => {
    expect(partirFrase('Tu próxima aventura te espera')).toEqual(['Tu próxima', 'aventura te espera'])
    expect(partirFrase('Una dos tres')).toEqual(['Una dos', 'tres'])
    expect(partirFrase('Tu próxima aventura')).toEqual(['Tu próxima', 'aventura'])
    expect(partirFrase('Rompé la rutina')).toEqual(['Rompé la', 'rutina'])
  })
  it('una sola palabra no se parte; vacío da dos vacíos', () => {
    expect(partirFrase('Aventura')).toEqual(['Aventura', ''])
    expect(partirFrase('  ')).toEqual(['', ''])
  })
})

describe('ajustarDiseno (deportiva) · la frase en dos líneas', () => {
  const ajD = (f: AspectoFoto, titular: string) => {
    const t = textos({ titular })
    const r = resolverDiseno(null, 'deportiva', { modelo: t.modelo, titular: t.titular, datos })
    return { a: ajustarDiseno(t, r, layoutDiseno('deportiva', f), 'deportiva'), c: layoutDiseno('deportiva', f).cajas.frase }
  }
  it.each(['4:5', '1:1', '9:16'] as AspectoFoto[])('%s: CADA línea entra en el ancho de la caja y las dos entran en su alto (si no, la de abajo se monta sobre el precio)', (f) => {
    for (const titular of ['Tu próxima aventura', 'Rompé la rutina', 'Vení a probarla', 'Hoy sí']) {
      const { a, c } = ajD(f, titular)
      const [l1, l2] = partirFrase(titular)
      expect(a.frase.lineas, titular).toBe(l2 ? 2 : 1)
      for (const l of [l1, l2].filter(Boolean)) expect(l.length * a.frase.tam * METRICAS['archivo-expanded'].ancho, `${f} ${titular} · ${l}`).toBeLessThanOrEqual(c.w)
      expect(a.frase.lineas * a.frase.tam * METRICAS['archivo-expanded'].linea, `${f} ${titular}`).toBeLessThanOrEqual(c.h)
    }
  })
})

describe('ajustarDiseno (editorial)', () => {
  const ajE = (o: { t?: Partial<TextosPlaca>; d?: Diseno | null; f?: AspectoFoto } = {}) => {
    const t = textos(o.t)
    const r = resolverDiseno(o.d ?? null, 'editorial', { modelo: t.modelo, titular: t.titular, datos })
    return ajustarDiseno(t, r, layoutDiseno('editorial', o.f ?? '4:5'), 'editorial')
  }
  it('el número por defecto sale del modelo (TRK 502 → 502) y entra en su caja en los tres formatos', () => {
    for (const f of ['4:5', '1:1', '9:16'] as const) {
      const a = ajE({ f })
      const c = layoutDiseno('editorial', f).cajas.numero!
      expect(a.numeroTam).toBeGreaterThan(100)
      expect(a.numeroTam * 0.72 * 3).toBeLessThanOrEqual(c.w)
      expect(a.numeroTam).toBeLessThanOrEqual(c.h)
    }
  })
  it('un número de 4 caracteres se achica para entrar a lo ancho', () => {
    expect(ajE({ d: { numero: '2025' } }).numeroTam).toBeLessThan(ajE().numeroTam)
  })
  it('sin número no hay bloque', () => {
    expect(ajE({ t: { modelo: 'Vespa Primavera' } }).numeroTam).toBe(0)
  })
  it('la lista: sin palabras no hay bloque; con palabras entra en la columna', () => {
    expect(ajE().listaTam).toBe(0)
    const a = ajE({ d: { lista: ['ABS', 'Bluetooth', 'Cardán'] } })
    expect(a.listaTam).toBeGreaterThanOrEqual(14)
    expect(a.listaTam * 0.62 * 'Bluetooth'.length).toBeLessThanOrEqual(layoutDiseno('editorial', '4:5').cajas.lista!.w)
  })
  it('la bajada va en una línea (espaciada) y entra', () => {
    const a = ajE()
    expect(a.frase.lineas).toBe(1)
    expect(a.frase.tam * 1.25).toBeLessThanOrEqual(layoutDiseno('editorial', '4:5').cajas.frase.h)
  })
  it('modelo y precio entran; mostrarPrecio=false → CONSULTÁ PRECIO', () => {
    expect(ajE().modelo.lineas).toBeGreaterThanOrEqual(1)
    expect(ajE({ d: { mostrarPrecio: false } }).textoPrecio).toBe(PRECIO_OCULTO)
  })
})
