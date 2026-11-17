import { describe, it, expect } from 'vitest'
import { layoutGrilla, textosDeGrilla, type Caja, type LayoutGrilla, type TextosGrilla } from './grilla'
import { ErrorTextoLargo } from '../plantillas'
import { filaPromocion } from '../fixture'
import type { MotoExtra } from './tipos'
import type { AspectoFoto } from '../../productor/ediciones'

const extra = (n: number, o: Partial<MotoExtra> = {}): MotoExtra => ({ fotoId: `f${n}`, modelo: `MOTO ${n}`, precio: { moneda: 'ARS', monto: n * 1_000_000 }, promo: { tipo: 'ninguna', detalle: '' }, ...o })
const fila = (extras: MotoExtra[], o: Parameters<typeof filaPromocion>[0] = {}) => filaPromocion({ modelo: 'ROUSER 200', titular: 'Elegí la tuya', motos_extra: extras, ...o })
const entrada = (f: ReturnType<typeof fila>, ocultos: readonly string[] = []) => ({
  marca: 'Suzuki Quilmes',
  modelo: f.modelo,
  datos: f.datos,
  motosExtra: f.motos_extra ?? [],
  titular: f.titular,
  titularDelTexto: null,
  lineaExtra: null,
  ocultos: ocultos as never,
})

describe('textosDeGrilla', () => {
  it('cada moto con su modelo, su precio formateado y su condición; la principal primero', () => {
    const t = textosDeGrilla(entrada(fila([extra(2, { promo: { tipo: 'cuotas', detalle: '12 cuotas sin interés' } }), extra(3)])))
    expect(t.motos).toEqual([
      { modelo: 'ROUSER 200', precio: '$ 4.500.000', condicion: '12 cuotas sin interés' },
      { modelo: 'MOTO 2', precio: '$ 2.000.000', condicion: '12 cuotas sin interés' },
      { modelo: 'MOTO 3', precio: '$ 3.000.000', condicion: '' },
    ])
  })
  it('lo de toda la placa: marca, titular, línea extra y lugar', () => {
    const t = textosDeGrilla({ ...entrada(fila([extra(2)])), lineaExtra: ' Hot Sale ' })
    expect(t).toMatchObject({ marca: 'Suzuki Quilmes', titular: 'Elegí la tuya', extra: 'Hot Sale', lugar: 'Quilmes' })
  })
  it('el titular del texto elegido en el paso 3 vale si no hay uno propio', () => {
    expect(textosDeGrilla({ ...entrada(fila([extra(2)], { titular: null })), titularDelTexto: 'Del texto' }).titular).toBe('Del texto')
  })
  it('una promo "ninguna" sin detalle no lleva condición (lo mismo que las otras placas)', () => {
    expect(textosDeGrilla(entrada(fila([extra(2)], { datos: { ...filaPromocion().datos, promo: { tipo: 'ninguna', detalle: '' } } }))).motos[0]!.condicion).toBe('')
  })
  describe('sacar textos (ocultos): vale para todas las motos', () => {
    it('precio y condición', () => {
      const t = textosDeGrilla(entrada(fila([extra(2)]), ['precio', 'condicion']))
      expect(t.motos.every((m) => m.precio === '' && m.condicion === '')).toBe(true)
      expect(t.motos.map((m) => m.modelo)).toEqual(['ROUSER 200', 'MOTO 2'])
    })
    it('modelo', () => {
      expect(textosDeGrilla(entrada(fila([extra(2)]), ['modelo'])).motos.map((m) => m.modelo)).toEqual(['', ''])
    })
    it('frase (el titular) y lugar', () => {
      expect(textosDeGrilla(entrada(fila([extra(2)]), ['frase', 'lugar']))).toMatchObject({ titular: '', lugar: '' })
    })
    it('los logos sacan el nombre de la marca', () => {
      expect(textosDeGrilla(entrada(fila([extra(2)]), ['logoConcesionaria'])).marca).toBe('')
    })
  })
})

const textos = (n: number, o: Partial<TextosGrilla> = {}): TextosGrilla => ({
  marca: 'Suzuki Quilmes',
  titular: 'Elegí la tuya',
  extra: '',
  lugar: 'Quilmes',
  motos: Array.from({ length: n }, (_, i) => ({ modelo: ['ROUSER 200', 'LEONCINO 500', 'TRK 502', 'GSX 150'][i]!, precio: `$ ${(i + 4) * 1_000_000 + 500_000}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.'), condicion: i % 2 === 0 ? '12 cuotas sin interés' : '' })),
  ...o,
})
const FORMATOS: AspectoFoto[] = ['1:1', '4:5', '9:16']
const ALTO = { '1:1': 1080, '4:5': 1350, '9:16': 1920 } as const
const dentro = (c: Caja, l: LayoutGrilla) => c.x >= 0 && c.y >= 0 && c.x + c.w <= l.ancho && c.y + c.h <= l.alto
const solapa = (a: Caja, b: Caja) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

describe('layoutGrilla: la geometría', () => {
  it('mide como el formato (1080 de ancho y 1080, 1350 o 1920 de alto)', () => {
    for (const fmt of FORMATOS) expect(layoutGrilla(textos(2), fmt)).toMatchObject({ ancho: 1080, alto: ALTO[fmt] })
  })
  it('una tarjeta por moto, en el orden de las motos', () => {
    for (const fmt of FORMATOS) for (const n of [2, 3, 4]) expect(layoutGrilla(textos(n), fmt).tarjetas).toHaveLength(n)
  })
  describe.each(FORMATOS.flatMap((f) => [2, 3, 4].map((n) => [f, n] as const)))('%s con %i motos', (fmt, n) => {
    const l = layoutGrilla(textos(n), fmt)
    it('todo cabe en el lienzo', () => {
      for (const t of l.tarjetas) {
        expect(dentro(t.caja, l)).toBe(true)
        expect(dentro(t.foto, l)).toBe(true)
      }
      expect(dentro(l.logo999, l)).toBe(true)
      expect(dentro(l.logoConcesionaria, l)).toBe(true)
      expect(dentro(l.titular.caja, l)).toBe(true)
      expect(dentro(l.lugar.caja, l)).toBe(true)
    })
    it('las tarjetas no se pisan entre sí ni con el encabezado ni con el pie', () => {
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) expect(solapa(l.tarjetas[i]!.caja, l.tarjetas[j]!.caja), `${i}-${j}`).toBe(false)
        expect(solapa(l.tarjetas[i]!.caja, l.titular.caja)).toBe(false)
        expect(solapa(l.tarjetas[i]!.caja, l.logo999)).toBe(false)
        expect(solapa(l.tarjetas[i]!.caja, l.logoConcesionaria)).toBe(false)
        expect(solapa(l.tarjetas[i]!.caja, l.lugar.caja)).toBe(false)
      }
    })
    it('la foto está dentro de su tarjeta y tiene un tamaño que se ve', () => {
      for (const t of l.tarjetas) {
        expect(t.foto.x).toBeGreaterThanOrEqual(t.caja.x)
        expect(t.foto.y).toBeGreaterThanOrEqual(t.caja.y)
        expect(t.foto.x + t.foto.w).toBeLessThanOrEqual(t.caja.x + t.caja.w)
        expect(t.foto.y + t.foto.h).toBeLessThanOrEqual(t.caja.y + t.caja.h)
        expect(t.foto.w).toBeGreaterThanOrEqual(200)
        expect(t.foto.h).toBeGreaterThanOrEqual(150)
      }
    })
    it('la caja de texto de cada tarjeta está dentro de ella, sin pisar la foto', () => {
      for (const t of l.tarjetas) {
        expect(t.texto.x).toBeGreaterThanOrEqual(t.caja.x)
        expect(t.texto.y).toBeGreaterThanOrEqual(t.caja.y)
        expect(t.texto.x + t.texto.w).toBeLessThanOrEqual(t.caja.x + t.caja.w)
        expect(t.texto.y + t.texto.h).toBeLessThanOrEqual(t.caja.y + t.caja.h)
        expect(solapa(t.texto, t.foto)).toBe(false)
      }
    })
    it('las letras no bajan de un tamaño que se lee en el celu', () => {
      for (const t of l.tarjetas) {
        expect(t.modelo.tam).toBeGreaterThanOrEqual(24)
        expect(t.precio.tam).toBeGreaterThanOrEqual(26)
        if (t.condicion.lineas > 0) expect(t.condicion.tam).toBeGreaterThanOrEqual(16)
      }
    })
    it('el bloque de texto de cada tarjeta entra en su caja', () => {
      for (const t of l.tarjetas) {
        const alto = [t.modelo, t.precio, t.condicion].reduce((s, x) => s + x.tam * x.alturaLinea * x.lineas, 0) + t.separacion * 2
        expect(alto).toBeLessThanOrEqual(t.texto.h + 1)
      }
    })
    it('cada texto cabe en el ancho de su caja', () => {
      for (const t of l.tarjetas) for (const x of [t.modelo, t.precio, t.condicion]) expect(x.lineas === 0 || x.anchoLinea <= t.texto.w).toBe(true)
    })
  })
  it('las columnas: 1:1 una por moto; 4:5 una sola salvo con 4 (2×2); 9:16 una sola', () => {
    expect([2, 3, 4].map((n) => layoutGrilla(textos(n), '1:1').columnas)).toEqual([2, 3, 4])
    expect([2, 3, 4].map((n) => layoutGrilla(textos(n), '4:5').columnas)).toEqual([1, 1, 2])
    expect([2, 3, 4].map((n) => layoutGrilla(textos(n), '9:16').columnas)).toEqual([1, 1, 1])
  })
  it('el orden de las motos es de izquierda a derecha y de arriba abajo', () => {
    const l = layoutGrilla(textos(4), '4:5')
    const c = l.tarjetas.map((t) => t.caja)
    expect(c[0]!.x).toBeLessThan(c[1]!.x)
    expect(c[0]!.y).toBe(c[1]!.y)
    expect(c[2]!.y).toBeGreaterThan(c[0]!.y)
    expect(c[2]!.x).toBe(c[0]!.x)
    const v = layoutGrilla(textos(3), '9:16').tarjetas.map((t) => t.caja.y)
    expect(v[0]!).toBeLessThan(v[1]!)
    expect(v[1]!).toBeLessThan(v[2]!)
  })
  it('es determinístico', () => {
    expect(layoutGrilla(textos(3), '4:5')).toEqual(layoutGrilla(textos(3), '4:5'))
  })
})

describe('layoutGrilla: textos que no hay', () => {
  it('sin titular el título no ocupa lugar y las tarjetas ganan alto', () => {
    const con = layoutGrilla(textos(2), '4:5')
    const sin = layoutGrilla(textos(2, { titular: '' }), '4:5')
    expect(sin.titular.lineas).toBe(0)
    expect(sin.tarjetas[0]!.caja.h).toBeGreaterThan(con.tarjetas[0]!.caja.h)
  })
  it('sin precio ni condición (sacados) el modelo sigue entrando', () => {
    const l = layoutGrilla(textos(3, { motos: textos(3).motos.map((m) => ({ ...m, precio: '', condicion: '' })) }), '1:1')
    expect(l.tarjetas.every((t) => t.precio.lineas === 0 && t.condicion.lineas === 0 && t.modelo.lineas > 0)).toBe(true)
  })
  it('sin lugar ni línea extra el pie no ocupa lugar', () => {
    const l = layoutGrilla(textos(2, { lugar: '', extra: '' }), '4:5')
    expect(l.lugar.lineas).toBe(0)
    expect(l.extra.lineas).toBe(0)
  })
  it('todos los textos sacados: queda la grilla de fotos', () => {
    const l = layoutGrilla({ marca: '', titular: '', extra: '', lugar: '', motos: textos(2).motos.map(() => ({ modelo: '', precio: '', condicion: '' })) }, '4:5')
    expect(l.tarjetas).toHaveLength(2)
  })
})

describe('layoutGrilla: un texto muy largo avisa, no se corta', () => {
  it('un modelo de 60 letras en 4 columnas lanza ErrorTextoLargo del modelo', () => {
    const t = textos(4, { motos: textos(4).motos.map((m, i) => (i === 1 ? { ...m, modelo: 'M'.repeat(60) } : m)) })
    expect(() => layoutGrilla(t, '1:1')).toThrow(ErrorTextoLargo)
    try {
      layoutGrilla(t, '1:1')
    } catch (e) {
      expect((e as ErrorTextoLargo).campo).toBe('modelo')
      expect((e as Error).message).toMatch(/moto 2/i)
    }
  })
  it('el mismo modelo largo entra en un formato con tarjetas anchas', () => {
    const t = textos(2, { motos: textos(2).motos.map((m, i) => (i === 1 ? { ...m, modelo: 'M'.repeat(40) } : m)) })
    expect(() => layoutGrilla(t, '9:16')).not.toThrow()
  })
  it('un titular imposible lanza ErrorTextoLargo del titular', () => {
    expect(() => layoutGrilla(textos(2, { titular: 'T'.repeat(200) }), '4:5')).toThrow(ErrorTextoLargo)
  })
  it('una condición imposible lanza ErrorTextoLargo de la promo', () => {
    const t = textos(4, { motos: textos(4).motos.map((m) => ({ ...m, condicion: 'x'.repeat(80) })) })
    expect(() => layoutGrilla(t, '1:1')).toThrow(ErrorTextoLargo)
  })
})
