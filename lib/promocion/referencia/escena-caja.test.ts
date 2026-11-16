import { describe, it, expect } from 'vitest'
import { BANDA_MOTO_EN_ESCENA, cajaDeEscena } from './escena-caja'
import { MEDIDAS } from '../plantillas'

const cajaMoto = { x: 100, y: 500, w: 880, h: 420 }
/** Dónde queda, en px del lienzo, la franja de la escena donde está la moto (70 % del ancho × 45 % del alto, del 30 % al 75 %). */
const banda = (e: { x: number; y: number; w: number; h: number }) => ({
  x: e.x + e.w * ((1 - BANDA_MOTO_EN_ESCENA.w) / 2),
  y: e.y + e.h * BANDA_MOTO_EN_ESCENA.desde,
  w: e.w * BANDA_MOTO_EN_ESCENA.w,
  h: e.h * (BANDA_MOTO_EN_ESCENA.hasta - BANDA_MOTO_EN_ESCENA.desde),
})

describe('cajaDeEscena: dónde se dibuja la escena para que SU moto caiga en la caja de la moto de la referencia', () => {
  it.each(['4:5', '1:1', '9:16'] as const)('con una escena %s la franja de la moto entra en la caja y la toca por un lado', (a) => {
    const [w, h] = MEDIDAS[a]
    const e = cajaDeEscena(cajaMoto, w / h)
    const b = banda(e)
    expect(b.x).toBeGreaterThanOrEqual(cajaMoto.x - 1)
    expect(b.y).toBeGreaterThanOrEqual(cajaMoto.y - 1)
    expect(b.x + b.w).toBeLessThanOrEqual(cajaMoto.x + cajaMoto.w + 1)
    expect(b.y + b.h).toBeLessThanOrEqual(cajaMoto.y + cajaMoto.h + 1)
    const llenaAncho = Math.abs(b.w - cajaMoto.w) <= 1
    const llenaAlto = Math.abs(b.h - cajaMoto.h) <= 1
    expect(llenaAncho || llenaAlto).toBe(true)
  })

  it('conserva la proporción de la escena (no la estira)', () => {
    const e = cajaDeEscena(cajaMoto, 0.8)
    expect(e.w / e.h).toBeCloseTo(0.8, 1)
  })

  it('queda centrada en horizontal sobre la caja de la moto', () => {
    const e = cajaDeEscena(cajaMoto, 1)
    expect(Math.abs(e.x + e.w / 2 - (cajaMoto.x + cajaMoto.w / 2))).toBeLessThanOrEqual(1)
  })

  it('una caja angosta y alta (moto grande a lo alto) también funciona', () => {
    const e = cajaDeEscena({ x: 200, y: 300, w: 500, h: 900 }, 0.8)
    const b = banda(e)
    expect(b.x).toBeGreaterThanOrEqual(199)
    expect(b.x + b.w).toBeLessThanOrEqual(701)
    expect(b.y + b.h).toBeLessThanOrEqual(1201)
  })

  it('enteros, y una aspecto inválido no rompe (cae a 4:5)', () => {
    const e = cajaDeEscena(cajaMoto, Number.NaN)
    for (const n of [e.x, e.y, e.w, e.h]) expect(Number.isInteger(n)).toBe(true)
    expect(e.w).toBeGreaterThan(0)
  })
})
