import { describe, expect, it } from 'vitest'
import { MENSAJE_MONTOS, montosDeDineroEnTexto } from './montos-placa'

const hay = (t: string, fuente = '') => montosDeDineroEnTexto(t, fuente).length > 0

describe('montosDeDineroEnTexto', () => {
  it.each(['12 cuotas', '3 y 6 cuotas', '18 cuotas sin interés', 'modelo 2025', 'Modelo 2026', '300 cc', '650cc', '0 km', '9.048 km', '30% off', '20 % de descuento', 'Solo por 48 hs', 'Promo 2x1', '2.500 cc', '12.000 km'])(
    'deja pasar lo que no es plata: %s',
    (t) => expect(hay(t)).toBe(false),
  )
  it.each(['$ 500', '$500.000', 'ARS 5000', 'USD 5990', 'U$S 3000', 'US$ 100', 'u$s 100', '500 pesos', '2000 dólares', '500 mil', '2 millones', '500k', '500K', '4500000', '1500', '3.900.000', '2200 de entrada', '12 cuotas de $ 90.000'])(
    'bloquea los montos: %s',
    (t) => expect(hay(t)).toBe(true),
  )
  it('el año solo vale entre 1900 y 2100, sin separadores', () => {
    expect(hay('2100')).toBe(false)
    expect(hay('1900')).toBe(false)
    expect(hay('2101')).toBe(true)
    expect(hay('1899')).toBe(true)
    expect(hay('2.025')).toBe(true)
  })
  it('km y cc solo salvan a un número grande si van pegados a él', () => {
    expect(hay('9.048 km')).toBe(false)
    expect(hay('9.048 kilos')).toBe(true)
  })
  it('un monto que ya es el precio cargado (fuente) no cuenta', () => {
    expect(hay('Llevátela por $ 4.500.000', 'ARS 4.500.000\n4500000')).toBe(false)
    expect(hay('Hoy $ 3.900.000', 'ARS 4.500.000\n4500000')).toBe(true)
    expect(hay('USD 5990', 'US$ 5.990\n5990')).toBe(false)
  })
  it('devuelve los montos encontrados', () => {
    expect(montosDeDineroEnTexto('12 cuotas de $ 90.000 o 500 mil', '')).toEqual(['$ 90.000', '500 mil'])
  })
  it('el mensaje explica qué sí se puede poner', () => {
    expect(MENSAJE_MONTOS).toBe('Los montos van solo en el precio. Podés poner cuotas, años, cilindrada o km.')
  })
})
