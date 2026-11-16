import { describe, it, expect } from 'vitest'
import { costoDeLectura, estimarLectura, modeloDeLectura, MODELO_VISION_POR_DEFECTO, PRECIOS_VISION, tienePrecioVision, TOKENS_PROMPT_LECTURA } from './precios'

describe('modelo de visión y su precio', () => {
  it('el modelo por defecto es Gemini 4 Argon (Carbon pasó los 60 s en producción) y tiene precio cargado', () => {
    expect(MODELO_VISION_POR_DEFECTO).toBe('gemini-4-argon')
    expect(tienePrecioVision(MODELO_VISION_POR_DEFECTO)).toBe(true)
  })

  it('Argon e Hydrogen se pueden usar cambiando solo el id: tienen precio', () => {
    expect(tienePrecioVision('gemini-4-argon')).toBe(true)
    expect(tienePrecioVision('gemini-4-hydrogen')).toBe(true)
  })

  it('el precio es el conservador de US$ 4 de entrada y US$ 20 de salida por millón, y está marcado a confirmar', () => {
    const p = PRECIOS_VISION['gemini-4-carbon']!
    expect(p.entrada).toBe(4)
    expect(p.salida).toBe(20)
    expect(p.aConfirmar).toBe(true)
  })

  it('un modelo sin precio no se usa: error ANTES de cualquier llamada (regla #3)', () => {
    expect(tienePrecioVision('gemini-inventado')).toBe(false)
    expect(() => estimarLectura('gemini-inventado')).toThrow(/sin precio/i)
    expect(() => costoDeLectura('gemini-inventado', { total_input_tokens: 1 })).toThrow(/sin precio/i)
  })

  it('"toString" o "constructor" no son modelos (hasOwn, no in)', () => {
    expect(tienePrecioVision('constructor')).toBe(false)
    expect(tienePrecioVision('toString')).toBe(false)
  })
})

describe('estimarLectura: el tope que se muestra y se compara con el tope mensual', () => {
  it('incluye el prompt, la imagen y TODA la salida posible (con el pensamiento), redondeado HACIA ARRIBA al centavo', () => {
    const p = PRECIOS_VISION['gemini-4-carbon']!
    const exacto = ((TOKENS_PROMPT_LECTURA + p.tokensImagen) * p.entrada + p.tokensSalidaTope * p.salida) / 1e6
    const e = estimarLectura('gemini-4-carbon')
    expect(e.topeUsd).toBeGreaterThanOrEqual(exacto)
    expect(e.topeUsd - exacto).toBeLessThan(0.01)
    expect(Math.round(e.topeUsd * 100)).toBeCloseTo(e.topeUsd * 100, 6)
  })

  it('con Argon son unos centavos (no el "US$ 0,01" viejo)', () => {
    const e = estimarLectura('gemini-4-carbon')
    expect(e.topeUsd).toBeGreaterThan(0.02)
    expect(e.topeUsd).toBeLessThanOrEqual(0.1)
  })

  it('el pedido a Gemini usa el MISMO tope de salida que el estimado', () => {
    expect(estimarLectura('gemini-4-carbon').tokensSalidaTope).toBe(PRECIOS_VISION['gemini-4-carbon']!.tokensSalidaTope)
  })
})

describe('costoDeLectura: el costo real, siempre un número', () => {
  it('entrada, salida y pensamiento a su precio', () => {
    const c = costoDeLectura('gemini-4-carbon', { total_input_tokens: 2600, total_output_tokens: 700, total_thought_tokens: 300 })
    expect(c.usd).toBeCloseTo((2600 * 4 + 1000 * 20) / 1e6, 8)
    expect(c.fuente).toBe('usage')
    expect(c.tokensEntrada).toBe(2600)
    expect(c.tokensSalida).toBe(1000)
  })

  it('sin usage cuenta el tope (nunca null ni 0 mentiroso)', () => {
    const c = costoDeLectura('gemini-4-carbon', null)
    expect(c.usd).toBe(estimarLectura('gemini-4-carbon').topeUsd)
    expect(c.fuente).toBe('tope')
  })

  it('un usage con basura cuenta como tope', () => {
    expect(costoDeLectura('gemini-4-carbon', { total_input_tokens: -5, total_output_tokens: Number.NaN }).fuente).toBe('tope')
    expect(costoDeLectura('gemini-4-carbon', {}).fuente).toBe('tope')
  })

  it('si Google cobró más que el estimado se registra lo real: no se esconde', () => {
    const c = costoDeLectura('gemini-4-carbon', { total_input_tokens: 9_000_000, total_output_tokens: 9_000_000 })
    expect(c.usd).toBeGreaterThan(estimarLectura('gemini-4-carbon').topeUsd)
  })
})

describe('modeloDeLectura: qué modelo lee', () => {
  it('sin variable, el de por defecto; con MODELO_LECTURA_REFERENCIA, ese (recortado)', () => {
    expect(modeloDeLectura({})).toBe(MODELO_VISION_POR_DEFECTO)
    expect(modeloDeLectura({ MODELO_LECTURA_REFERENCIA: '   ' })).toBe(MODELO_VISION_POR_DEFECTO)
    expect(modeloDeLectura({ MODELO_LECTURA_REFERENCIA: ' gemini-4-argon ' })).toBe('gemini-4-argon')
  })
})
