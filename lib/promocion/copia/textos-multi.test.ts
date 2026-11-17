import { describe, it, expect } from 'vitest'
import { textosCopiaFiel, textosVisibles } from './textos'
import { hashTextos } from './hash-textos'
import { filaPromocion } from '../fixture'
import type { MotoExtra } from '../varias/tipos'

const con = { negocio: 'Suzuki Quilmes', logoDibujable: true }
const extra = (n: number, o: Partial<MotoExtra> = {}): MotoExtra => ({
  fotoId: `f${n}`,
  modelo: `MOTO ${n}`,
  precio: { moneda: 'ARS', monto: 1_000_000 * n },
  promo: { tipo: 'ninguna', detalle: '' },
  ...o,
})
const fila = (extras: MotoExtra[] | null, o: Parameters<typeof filaPromocion>[0] = {}) => filaPromocion({ modelo: 'ROUSER 200', titular: 'Tu próxima moto', motos_extra: extras, ...o })

describe('una moto sola: nada cambia (ni el hash de las imágenes ya generadas)', () => {
  it('sin motos_extra no hay clave `motos` en los textos', () => {
    expect('motos' in textosCopiaFiel(fila(null), con)).toBe(false)
    expect('motos' in textosCopiaFiel(filaPromocion({ modelo: 'ROUSER 200' }), con)).toBe(false)
    expect('motos' in textosCopiaFiel(fila([]), con)).toBe(false)
  })
  it('el hash de una moto sola es el de siempre', () => {
    expect(hashTextos(textosCopiaFiel(fila(null), con))).toBe(hashTextos(textosCopiaFiel(filaPromocion({ modelo: 'ROUSER 200', titular: 'Tu próxima moto' }), con)))
  })
})

describe('varias motos: textos por moto', () => {
  it('cada moto lleva su modelo, su precio y su condición; la principal es la 1', () => {
    const t = textosCopiaFiel(fila([extra(2, { precio: { moneda: 'USD', monto: 5990 }, promo: { tipo: 'cuotas', detalle: '12 cuotas sin interés' } }), extra(3)]), con)
    expect(t.motos).toEqual([
      { modelo: 'ROUSER 200', precio: '$ 4.500.000', condicion: { texto: '12 CUOTAS', destacado: 'SIN INTERÉS' } },
      { modelo: 'MOTO 2', precio: 'US$ 5.990', condicion: { texto: '12 CUOTAS', destacado: 'SIN INTERÉS' } },
      { modelo: 'MOTO 3', precio: '$ 3.000.000', condicion: null },
    ])
  })
  it('los textos de toda la placa (frase, botón, lugar, logo) son únicos', () => {
    const t = textosCopiaFiel(fila([extra(2)], { diseno: { frase: 'Elegí la tuya', cta: 'Vení a verla' } }), con)
    expect(t).toMatchObject({ frase: 'Elegí la tuya', cta: 'Vení a verla', lugar: 'Quilmes', logo: 'real', negocio: null })
  })
  it('los campos de una sola moto quedan en null: el modelo, el precio y la condición viven en `motos`', () => {
    const t = textosCopiaFiel(fila([extra(2)]), con)
    expect(t).toMatchObject({ modelo: null, precio: null, condicion: null })
  })
  it('limpia los delimitadores del prompt del modelo y de la condición, y acota la condición a 60', () => {
    const t = textosCopiaFiel(fila([extra(2, { modelo: 'Rouser «200»', promo: { tipo: 'oferta', detalle: 'x'.repeat(80) } })]), con)
    expect(t.motos![1]!.modelo).toBe('Rouser 200')
    expect((t.motos![1]!.condicion!.texto + t.motos![1]!.condicion!.destacado).length).toBeLessThanOrEqual(60)
  })
  it('mostrarPrecio=false saca TODOS los precios', () => {
    const t = textosCopiaFiel(fila([extra(2)], { diseno: { mostrarPrecio: false } }), con)
    expect(t.motos!.map((m) => m.precio)).toEqual([null, null])
  })
  describe('sacar textos (ocultos) vale para todas las motos', () => {
    it('precio', () => {
      const t = textosCopiaFiel(fila([extra(2)], { diseno: { ocultos: ['precio'] } }), con)
      expect(t.motos!.map((m) => m.precio)).toEqual([null, null])
      expect(t.ocultos).toEqual(['precio'])
    })
    it('modelo y condición', () => {
      const t = textosCopiaFiel(fila([extra(2, { promo: { tipo: 'contado', detalle: '' } })], { diseno: { ocultos: ['modelo', 'condicion'] } }), con)
      expect(t.motos!.map((m) => [m.modelo, m.condicion])).toEqual([[null, null], [null, null]])
    })
  })
  it('cambiar el precio de cualquier moto cambia el hash (la imagen ya no es de estos textos)', () => {
    const a = hashTextos(textosCopiaFiel(fila([extra(2), extra(3)]), con))
    const b = hashTextos(textosCopiaFiel(fila([extra(2), extra(3, { precio: { moneda: 'ARS', monto: 1 } })]), con))
    expect(a).not.toBe(b)
  })
  it('el orden de las motos importa (el emparejamiento foto-texto)', () => {
    const a = hashTextos(textosCopiaFiel(fila([extra(2), extra(3)]), con))
    const b = hashTextos(textosCopiaFiel(fila([extra(3), extra(2)]), con))
    expect(a).not.toBe(b)
  })
  it('el snapshot entra en los 2 KB de la base con 4 motos al máximo', () => {
    const largo = (n: number) => extra(n, { modelo: 'M'.repeat(60), promo: { tipo: 'oferta', detalle: 'y'.repeat(80) }, precio: { moneda: 'ARS', monto: 999_999_999 } })
    const t = textosCopiaFiel(fila([largo(2), largo(3), largo(4)], { modelo: 'M'.repeat(60), diseno: { frase: 'f'.repeat(28), cta: 'Consultanos' } }), { negocio: 'N'.repeat(40), logoDibujable: false })
    expect(JSON.stringify(t).length).toBeLessThan(2048)
  })
})

describe('textosVisibles con varias motos', () => {
  it('una línea por moto, en orden, y después lo de toda la placa', () => {
    const t = textosCopiaFiel(fila([extra(2)]), con)
    expect(textosVisibles(t)).toEqual(['ROUSER 200', '$ 4.500.000', '12 CUOTAS SIN INTERÉS', 'MOTO 2', '$ 2.000.000', 'Tu próxima moto', 'Consultanos', 'Quilmes'])
  })
})
