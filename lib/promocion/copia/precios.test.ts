import { describe, it, expect } from 'vitest'
import { costoDeVerificacion, estimarCopiaFiel, estimarVerificacion, modeloDeVerificacion, SALIDA_TOPE_VERIFICACION, TIMEOUT_VERIFICACION_MS } from './precios'
import { MODELO_VISION_POR_DEFECTO } from '../referencia/precios'

const ARGON = 'gemini-4-argon'

describe('estimarVerificacion', () => {
  it('con Argon son US$ 0,05 (tope, un centavo hacia arriba)', () => {
    const e = estimarVerificacion(ARGON)
    expect(e.topeUsd).toBe(0.05)
    expect(e.tokensSalidaTope).toBe(SALIDA_TOPE_VERIFICACION)
    expect(e.pensamiento).toBe('low')
  })
  it('un modelo sin precio lanza ANTES de cualquier llamada', () => {
    expect(() => estimarVerificacion('modelo-inventado')).toThrow(/Sin precio/)
  })
  it('el tiempo de espera es el de la función', () => expect(TIMEOUT_VERIFICACION_MS).toBe(75_000))
})

describe('costoDeVerificacion', () => {
  it('con usage: tokens por su precio', () => {
    const c = costoDeVerificacion(ARGON, { total_input_tokens: 2000, total_output_tokens: 300, total_thought_tokens: 200 })
    expect(c.fuente).toBe('usage')
    expect(c.usd).toBeCloseTo((2000 * 4 + 500 * 20) / 1e6, 8)
  })
  it('sin usage o con basura cuenta el tope: pudo haberse cobrado', () => {
    expect(costoDeVerificacion(ARGON, null)).toMatchObject({ usd: 0.05, fuente: 'tope' })
    expect(costoDeVerificacion(ARGON, { total_input_tokens: -3, total_output_tokens: Number.NaN } as never)).toMatchObject({ usd: 0.05, fuente: 'tope' })
  })
})

describe('estimarCopiaFiel', () => {
  it('Pro, 1 variante: imagen + verificación', () => {
    const e = estimarCopiaFiel('gemini-3-pro-image', 1, ARGON)
    expect(e.topeImagenUsd).toBeCloseTo(0.18724, 6)
    expect(e.verificacionUsd).toBe(0.05)
    expect(e.topeTotalUsd).toBeCloseTo(0.23724, 6)
    expect(e.porImagenUsd).toBe(0.134)
  })
  it('Nano Banana, 1 variante', () => {
    expect(estimarCopiaFiel('gemini-nano-banana-2.1', 1, ARGON).topeTotalUsd).toBeCloseTo(0.09671, 6)
  })
  it('2 variantes Pro = 2 imágenes + 2 verificaciones', () => {
    expect(estimarCopiaFiel('gemini-3-pro-image', 2, ARGON).topeTotalUsd).toBeCloseTo(0.47448, 6)
  })
  it('un motor o un modelo de verificación sin precio lanza', () => {
    expect(() => estimarCopiaFiel('motor-x', 1, ARGON)).toThrow(/Sin precio/)
    expect(() => estimarCopiaFiel('gemini-3-pro-image', 1, 'modelo-x')).toThrow(/Sin precio/)
  })
})

describe('modeloDeVerificacion', () => {
  it('por defecto el de visión; MODELO_VERIFICACION_TEXTOS lo cambia', () => {
    expect(modeloDeVerificacion({})).toBe(MODELO_VISION_POR_DEFECTO)
    expect(modeloDeVerificacion({ MODELO_VERIFICACION_TEXTOS: ' gemini-4-carbon ' })).toBe('gemini-4-carbon')
    expect(modeloDeVerificacion({ MODELO_VERIFICACION_TEXTOS: '  ' })).toBe(MODELO_VISION_POR_DEFECTO)
  })
})
