import { describe, it, expect } from 'vitest'
import { costoUsd, FUENTE_PRECIOS, PRECIOS, type Uso } from './precios'

const uso = (o: Partial<Uso> = {}): Uso => ({
  entrada: 0,
  cacheadas: 0,
  escrituraCache: 0,
  salida: 0,
  razonamiento: 0,
  ...o,
})

describe('costoUsd', () => {
  it('3000 de entrada y 2000 de salida en gpt-6-luna cuestan US$ 0,0013', () => {
    expect(costoUsd('gpt-6-luna', uso({ entrada: 3000, salida: 2000 }))).toBe(0.0013)
  })

  it('los tokens cacheados se cobran a la tarifa cacheada y no se cuentan dos veces', () => {
    // 1000 sin cache a 0.10 + 2000 cacheados a 0.01 = 100 + 20 = 120 -> 0.00012
    expect(costoUsd('gpt-6-luna', uso({ entrada: 3000, cacheadas: 2000 }))).toBe(0.00012)
  })

  it('la escritura de cache se cobra aparte y tampoco se cuenta doble', () => {
    // 1000 normales (100) + 1000 cacheados (10) + 1000 escritos (125) = 235 -> 0.000235
    expect(
      costoUsd('gpt-6-luna', uso({ entrada: 3000, cacheadas: 1000, escrituraCache: 1000 })),
    ).toBe(0.000235)
  })

  it('el razonamiento ya viene dentro de la salida: no suma aparte', () => {
    const a = costoUsd('gpt-6-luna', uso({ salida: 2000 }))
    const b = costoUsd('gpt-6-luna', uso({ salida: 2000, razonamiento: 1500 }))
    expect(b).toBe(a)
  })

  it('redondea a 6 decimales', () => {
    expect(costoUsd('gpt-6-luna', uso({ entrada: 1, salida: 1 }))).toBe(0.000001)
  })

  it('un modelo fuera de la tabla lanza: nunca devuelve 0', () => {
    expect(() => costoUsd('modelo-inventado', uso({ entrada: 10 }))).toThrow(/modelo-inventado/)
  })

  it('la tabla declara su fuente y la fecha de verificación', () => {
    expect(FUENTE_PRECIOS.url).toBe('https://developers.openai.com/api/docs/pricing')
    expect(FUENTE_PRECIOS.verificado).toBe('2026-10-20')
  })

  it('gpt-6-luna es el modelo de la tabla con sus 4 tarifas por millón', () => {
    expect(PRECIOS['gpt-6-luna']).toEqual({ entrada: 0.1, cacheada: 0.01, escrituraCache: 0.125, salida: 0.5 })
  })
})
