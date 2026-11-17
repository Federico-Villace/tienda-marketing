import { describe, it, expect } from 'vitest'
import { estimarCopiaFiel, imagenesDeEntradaCopia } from './precios'
import { estimarImagenes, imagenesDeEntrada } from '../../productor/precios'

const ARGON = 'gemini-4-argon'

describe('imagenesDeEntradaCopia: las fotos de las motos más la referencia', () => {
  it('una moto sola: 2 (como siempre)', () => expect(imagenesDeEntradaCopia(1)).toBe(2))
  it('de 2 a 4 motos: 3 a 5', () => {
    expect(imagenesDeEntradaCopia(2)).toBe(3)
    expect(imagenesDeEntradaCopia(3)).toBe(4)
    expect(imagenesDeEntradaCopia(4)).toBe(5)
  })
  it('una cantidad fuera de 1 a 4 lanza: nunca se estima con un número inventado', () => {
    expect(() => imagenesDeEntradaCopia(0)).toThrow()
    expect(() => imagenesDeEntradaCopia(5)).toThrow()
    expect(() => imagenesDeEntradaCopia(1.5)).toThrow()
  })
})

describe('imagenesDeEntrada de una generación con motos extra', () => {
  it('suma las fotos extra a la moto principal y la referencia', () => {
    expect(imagenesDeEntrada({ foto_id: 'f', referencia_foto_id: 'r' })).toBe(2)
    expect(imagenesDeEntrada({ foto_id: 'f', referencia_foto_id: 'r', fotos_extra: 1 })).toBe(3)
    expect(imagenesDeEntrada({ foto_id: 'f', referencia_foto_id: 'r', fotos_extra: 3 })).toBe(5)
  })
})

describe('cada foto de entrada de más cuesta más (el tope sube)', () => {
  it('Pro: cada imagen suma 560 tokens de entrada a US$ 2 por millón', () => {
    const dos = estimarImagenes('gemini-3-pro-image', 1, { imagenesEntrada: 2 }).topePorImagenUsd
    const cinco = estimarImagenes('gemini-3-pro-image', 1, { imagenesEntrada: 5 }).topePorImagenUsd
    expect(cinco - dos).toBeCloseTo((3 * 560 * 2) / 1e6, 6)
  })
  it('Nano Banana: 1120 tokens a US$ 1,5 por millón', () => {
    const dos = estimarImagenes('gemini-nano-banana-2.1', 1, { imagenesEntrada: 2 }).topePorImagenUsd
    const cinco = estimarImagenes('gemini-nano-banana-2.1', 1, { imagenesEntrada: 5 }).topePorImagenUsd
    expect(cinco - dos).toBeCloseTo((3 * 1120 * 1.5) / 1e6, 6)
  })
})

describe('estimarCopiaFiel con varias motos', () => {
  it('Pro, 2 motos (3 imágenes de entrada), 1 variante: imagen + revisión', () => {
    const e = estimarCopiaFiel('gemini-3-pro-image', 1, ARGON, imagenesDeEntradaCopia(2))
    expect(e.topeImagenUsd).toBeCloseTo(0.134 + (4000 * 12) / 1e6 + ((1500 + 3 * 560) * 2) / 1e6, 6)
    expect(e.topeTotalUsd).toBeCloseTo(e.topeImagenUsd + 0.05, 6)
  })
  it('Pro, 4 motos: 0,1906 + 0,05 = US$ 0,2406 (se muestra US$ 0,24)', () => {
    const e = estimarCopiaFiel('gemini-3-pro-image', 1, ARGON, imagenesDeEntradaCopia(4))
    expect(e.topeImagenUsd).toBeCloseTo(0.1906, 6)
    expect(e.topeTotalUsd).toBeCloseTo(0.2406, 6)
  })
  it('es siempre mayor que con una sola moto y crece con cada moto', () => {
    const t = (n: number) => estimarCopiaFiel('gemini-3-pro-image', 1, ARGON, imagenesDeEntradaCopia(n)).topeTotalUsd
    expect(t(2)).toBeGreaterThan(t(1))
    expect(t(3)).toBeGreaterThan(t(2))
    expect(t(4)).toBeGreaterThan(t(3))
  })
  it('2 variantes con 3 motos: 2 imágenes y 2 revisiones', () => {
    const una = estimarCopiaFiel('gemini-3-pro-image', 1, ARGON, imagenesDeEntradaCopia(3)).topeTotalUsd
    expect(estimarCopiaFiel('gemini-3-pro-image', 2, ARGON, imagenesDeEntradaCopia(3)).topeTotalUsd).toBeCloseTo(una * 2, 6)
  })
})
