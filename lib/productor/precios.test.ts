import { describe, it, expect } from 'vitest'
import {
  FUENTE_PRECIOS_IMAGEN,
  FUENTE_PRECIO_ENTRADA_IMAGEN,
  MAX_IMAGENES,
  MOTOR_IMAGEN_POR_DEFECTO,
  PRECIOS_IMAGEN,
  costoDeUso,
  estimarImagenes,
  tienePrecioImagen,
} from './precios'

describe('precios de imagen (R1)', () => {
  it('S1.4 expone la fuente oficial y la fecha de verificación', () => {
    expect(FUENTE_PRECIOS_IMAGEN.url).toBe('https://ai.google.dev/gemini-api/docs/pricing')
    expect(FUENTE_PRECIOS_IMAGEN.verificado).toBe('2026-10-19')
  })

  it('tiene los dos motores oficiales a 1K y el por defecto es el barato', () => {
    expect(PRECIOS_IMAGEN['gemini-nano-banana-2.1']!.porImagen1K).toBe(0.0336)
    expect(PRECIOS_IMAGEN['gemini-3-pro-image']!.porImagen1K).toBe(0.134)
    expect(MOTOR_IMAGEN_POR_DEFECTO).toBe('gemini-nano-banana-2.1')
    expect(MAX_IMAGENES).toBe(4)
  })

  it('tienePrecioImagen no acepta motores apagados ni prototipos', () => {
    expect(tienePrecioImagen('gemini-nano-banana-2.1')).toBe(true)
    expect(tienePrecioImagen('imagen-4.0-generate')).toBe(false)
    expect(tienePrecioImagen('toString')).toBe(false)
  })
})

describe('estimarImagenes', () => {
  it('S1.1 nano banana 2.1 x3 = 0,1008 a precio de lista', () => {
    expect(estimarImagenes('gemini-nano-banana-2.1', 3).totalUsd).toBe(0.1008)
  })

  it('S1.2 pro x2 = 0,268', () => {
    expect(estimarImagenes('gemini-3-pro-image', 2).totalUsd).toBe(0.268)
  })

  it('el tope suma entrada y pensamiento y siempre es mayor que la lista', () => {
    const e = estimarImagenes('gemini-nano-banana-2.1', 1)
    // 0,0336 + 1500*1,5/1e6 + 1000*7,5/1e6
    expect(e.topePorImagenUsd).toBe(0.04335)
    expect(e.topeTotalUsd).toBe(0.04335)
    const p = estimarImagenes('gemini-3-pro-image', 2)
    // 0,134 + 1500*2/1e6 + 4000*12/1e6 = 0,185
    expect(p.topePorImagenUsd).toBe(0.185)
    expect(p.topeTotalUsd).toBe(0.37)
  })

  it('S1.3 un motor sin precio tira error', () => {
    expect(() => estimarImagenes('imagen-4.0-generate', 1)).toThrow(/sin precio/i)
  })
})

describe('estimarImagenes con foto de entrada (F1)', () => {
  it('regresión: sin foto el tope no cambia (NB2.1 x2 = 0,0867)', () => {
    expect(estimarImagenes('gemini-nano-banana-2.1', 2).topeTotalUsd).toBe(0.0867)
    expect(estimarImagenes('gemini-nano-banana-2.1', 2, {}).topeTotalUsd).toBe(0.0867)
    expect(estimarImagenes('gemini-nano-banana-2.1', 2, { conFoto: false }).topeTotalUsd).toBe(0.0867)
  })

  it('S1.1 NB2.1 con foto: 0,04503 por imagen (0,0336 + 0,00393 + 0,0075)', () => {
    const e = estimarImagenes('gemini-nano-banana-2.1', 2, { conFoto: true })
    expect(e.topePorImagenUsd).toBe(0.04503)
    expect(e.topeTotalUsd).toBe(0.09006)
    // el precio de lista no cambia: la entrada solo sube el tope
    expect(e.totalUsd).toBe(0.0672)
  })

  it('S1.2 Pro con foto: 0,18612 por imagen', () => {
    expect(estimarImagenes('gemini-3-pro-image', 1, { conFoto: true }).topePorImagenUsd).toBe(0.18612)
  })

  it('tokensImagenEntrada: NB2.1 1120 (supuesto) y Pro 560 (oficial)', () => {
    expect(PRECIOS_IMAGEN['gemini-nano-banana-2.1']!.tokensImagenEntrada).toBe(1120)
    expect(PRECIOS_IMAGEN['gemini-3-pro-image']!.tokensImagenEntrada).toBe(560)
    expect(FUENTE_PRECIO_ENTRADA_IMAGEN.nota).toMatch(/supuesto/i)
  })

  it('S1.3 un motor sin precio tira error aunque haya foto', () => {
    expect(() => estimarImagenes('imagen-4.0-generate', 1, { conFoto: true })).toThrow(/sin precio/i)
  })
})

describe('costoDeUso', () => {
  const usage = {
    total_input_tokens: 100,
    total_output_tokens: 1400,
    total_thought_tokens: 200,
    output_tokens_by_modality: [
      { modality: 'IMAGE', tokens: 1120 },
      { modality: 'text', tokens: 80 },
    ],
  }

  it('cobra entrada, imagen y texto+pensamiento por separado', () => {
    // texto = 1400-1120 = 280; pensamiento 200
    // (100*1,5 + 1120*30 + 480*7,5)/1e6 = (150+33600+3600)/1e6
    const c = costoDeUso('gemini-nano-banana-2.1', usage, true)
    expect(c.usd).toBe(0.03735)
    expect(c.fuente).toBe('usage')
    expect(c.tokens).toEqual({ entrada: 100, imagen: 1120, texto: 280, pensamiento: 200 })
  })

  it('sin thought ni by_modality: todo lo de salida con imagen es imagen=0 y texto=salida', () => {
    const c = costoDeUso('gemini-3-pro-image', { total_input_tokens: 10, total_output_tokens: 100 }, true)
    // (10*2 + 100*12)/1e6
    expect(c.usd).toBe(0.00122)
    expect(c.fuente).toBe('usage')
  })

  it('sin usage y con imagen usa la tarifa fija', () => {
    expect(costoDeUso('gemini-nano-banana-2.1', null, true)).toMatchObject({ usd: 0.0336, fuente: 'tarifa' })
  })

  it('sin usage y sin imagen es sin cargo, pero un número', () => {
    expect(costoDeUso('gemini-nano-banana-2.1', null, false)).toMatchObject({ usd: 0, fuente: 'sin_cargo' })
  })

  it('un modelo sin precio tira error', () => {
    expect(() => costoDeUso('x', null, true)).toThrow(/sin precio/i)
  })
})
